import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import type { Prisma, Region } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { isAdminRole } from '../auth/role-access.util';
import type { AuthenticatedUser } from '../auth/types';

/** 分店代碼前綴：A=北部, B=中部, C=南部 */
const REGION_PREFIX: Record<Region, string> = {
  A: 'A',
  B: 'B',
  C: 'C',
};

interface CreateStoreInput {
  name: string;
  region: Region;
  phone?: string;
  address?: string;
  note?: string;
}

export interface StoreSummary {
  id: number;
  code: string;
  name: string;
  region: Region;
  regionSequence: number;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  dealerId: number | null;
  dealerName: string | null;
}


@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 給「建立顧客」精靈在 admin 操作時選店用，預設只回啟用中的分店。
   * 分店管理頁（admin/system_admin/dealer 能看）需要連停用中的分店也列出來才能切回啟用，
   * 用 includeInactive 切換，並且只信任管理員角色——dealer/manager 即使硬塞這個參數也只會拿到啟用中的清單。
   *
   * 區域鎖定：經銷商（dealer）無論帶不帶 includeInactive，一律只能看到自己負責區域的分店——
   * 這是查詢層級的第二道防線，跟 createStore() 的寫入防線是同一套規則（actor.region 不符就看不到）。
   */
  async listStores(actor: AuthenticatedUser, includeInactive = false): Promise<StoreSummary[]> {
    if ((actor.role === 'dealer' || actor.role === 'general_agent') && !actor.region) {
      return [];
    }

    const allowInactive = includeInactive && isAdminRole(actor.role);
    // 上面已經擋掉 dealer 沒有 region 的情況，這裡的 actor.region 對 dealer 來說保證不是 null
    const regionFilter = (actor.role === 'dealer' || actor.role === 'general_agent') ? { region: actor.region as Region } : {};
    const stores = await this.prisma.store.findMany({
      where: { deletedAt: null, ...regionFilter, ...(allowInactive ? {} : { isActive: true }) },
      orderBy: [{ region: 'asc' }, { regionSequence: 'asc' }],
      select: STORE_SELECT,
    });
    return stores.map(toSummary);
  }

  /**
   * 對齊 Version 1 的分店編號規則：code = 區域字母 + 該區域內的流水序號（兩位數，從 01 起跳）。
   * 序號是「每個區域各自獨立計算」——北部第 1 間跟中部第 1 間都會是 01，不是全公司共用一條序號。
   *
   * 防併發：用 Postgres advisory lock（依 region 字串 hash 出鎖 id）包住整段
   * 「查目前最大序號 → +1 → 寫入新分店」，鎖綁在這次交易上（pg_advisory_xact_lock），
   * 交易結束（commit/rollback）就自動釋放。這樣即使同一區域有兩個人幾乎同時按下
   * 「新增分店」，第二個請求會被擋在交易裡等第一個交易結束才能往下查序號，
   * 不會兩邊都算出同一個序號、撞出重複的 code（這比單純「先查再寫」多了一層鎖，
   * 否則兩個請求都查到同一個「目前最大序號」會各自 +1 算出同一個號碼）。
   *
   * 地域鎖定：經銷商只能建立自己負責區域內的分店——這個檢查刻意放在 transaction 開始之前，
   * 越權的請求連 advisory lock 都不用去搶，直接擋掉。
   */
  async createStore(actor: AuthenticatedUser, input: CreateStoreInput): Promise<StoreSummary> {
    const name = input.name?.trim();
    if (!name) {
      throw new AppError('STORE_NAME_REQUIRED', 'name is required');
    }

    if ((actor.role === 'dealer' || actor.role === 'general_agent') && input.region !== actor.region) {
      throw new AppError('STORE_REGION_UNAUTHORIZED', 'dealer can only create stores in their own region', 403);
    }

    const store = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', input.region);

      const last = await tx.store.findFirst({
        where: { region: input.region },
        orderBy: { regionSequence: 'desc' },
        select: { regionSequence: true },
      });
      const regionSequence = (last?.regionSequence ?? 0) + 1;
      const code = `${REGION_PREFIX[input.region]}${String(regionSequence).padStart(2, '0')}`;

      return tx.store.create({
        data: {
          code, name, region: input.region, regionSequence,
          phone: input.phone, address: input.address, note: input.note,
        },
        select: STORE_SELECT,
      });
    });

    return toSummary(store);
  }

  /** 啟用/停用快速切換，跟刪除是兩件事——停用只是讓它之後不能再被選來建顧客，資料還在 */
  /** 更新商店基本資訊（名稱、電話、地址、備註），限 admin/system_admin */
  async updateStore(
    id: number,
    input: { name?: string; phone?: string; address?: string; note?: string },
  ): Promise<StoreSummary> {
    const existing = await this.prisma.store.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new AppError('STORE_NOT_FOUND', '找不到此分店', 404);
    const updated = await this.prisma.store.update({
      where: { id },
      data: {
        ...(input.name?.trim() ? { name: input.name.trim() } : {}),
        ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
        ...(input.address !== undefined ? { address: input.address || null } : {}),
        ...(input.note !== undefined ? { note: input.note || null } : {}),
      },
      select: STORE_SELECT,
    });
    return toSummary(updated);
  }

  async setActive(id: number, isActive: boolean): Promise<StoreSummary> {
    const existing = await this.prisma.store.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      throw new AppError('STORE_NOT_FOUND', `store ${id} not found`, 404);
    }
    const updated = await this.prisma.store.update({ where: { id }, data: { isActive }, select: STORE_SELECT });
    return toSummary(updated);
  }

  /**
   * 軟刪除：分店底下還有顧客（Customer.storeId 是必填欄位，不能變成孤兒）或還在職的店長帳號時
   * 先擋下來，要求管理員先把人/顧客處理掉（轉店或刪除）才能刪這間分店——軟刪除本身不會破壞
   * 外鍵完整性（Store 那一列還在，只是多一個 deletedAt 標記），這層檢查是業務邏輯上的保護，
   * 避免一間還有實際營運資料的分店被誤刪。
   */
  async deleteStore(id: number): Promise<void> {
    const existing = await this.prisma.store.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      throw new AppError('STORE_NOT_FOUND', `store ${id} not found`, 404);
    }

    const [customerCount, userCount] = await Promise.all([
      this.prisma.customer.count({ where: { storeId: id, deletedAt: null } }),
      this.prisma.user.count({ where: { storeId: id, deletedAt: null } }),
    ]);
    if (customerCount > 0 || userCount > 0) {
      throw new AppError(
        'STORE_HAS_DEPENDENTS',
        `store ${id} still has ${customerCount} customers and ${userCount} users attached`,
        409,
      );
    }

    await this.prisma.store.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  }

  /** 更新分店功能開關，限 manager 操作自己的分店（admin/system_admin 無限制） */
  async updateStoreFeatures(id: number, features: Record<string, boolean>) {
    const store = await this.prisma.store.findFirst({ where: { id, deletedAt: null } });
    if (!store) throw new AppError('STORE_NOT_FOUND', '找不到此分店', 404);
    await this.prisma.store.update({ where: { id }, data: { features } });
  }

  /**
   * 建立分店員工帳號。
   * - manager 操作：強制 storeId = actor.storeId，role 強制鎖定為 'staff'（禁止越權）
   * - admin/system_admin 操作：允許任意分店，但 role 仍鎖定為 'staff'（此端點只開放建立員工）
   */
  async createStoreStaff(
    actor: AuthenticatedUser,
    storeId: number,
    input: { name: string; username: string; password: string },
  ) {
    if (!isAdminRole(actor.role) && actor.role !== 'manager') {
      throw new AppError('PERMISSION_DENIED', '只有店長或管理員可以建立員工帳號', 403);
    }
    if (actor.role === 'manager' && actor.storeId !== storeId) {
      throw new AppError('STAFF_STORE_MISMATCH', '只能為自己所屬分店建立員工帳號', 403);
    }

    const store = await this.prisma.store.findFirst({ where: { id: storeId, deletedAt: null } });
    if (!store) throw new AppError('STORE_NOT_FOUND', '找不到此分店', 404);

    const usernameTrimmed = input.username.trim().toLowerCase();
    const existingUsername = await this.prisma.user.findFirst({ where: { username: usernameTrimmed, deletedAt: null } });
    if (existingUsername) throw new AppError('USER_USERNAME_EXISTS', '這個帳號名稱已被使用', 409);

    if (!input.password || input.password.length < 8) {
      throw new AppError('USER_PASSWORD_TOO_SHORT', '密碼至少要 8 個字元', 400);
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    // email 欄位為 DB NOT NULL，用 placeholder（不對外暴露）
    const placeholderEmail = `${usernameTrimmed}@store.internal`;
    const user = await this.prisma.user.create({
      data: {
        username: usernameTrimmed,
        name: input.name.trim(),
        email: placeholderEmail,
        password: passwordHash,
        role: 'staff',
        storeId,
        parentId: actor.id,
        dealerId: (actor.role === 'dealer' || actor.role === 'general_agent') ? actor.id : (actor.dealerId ?? null),
      },
      select: { id: true, username: true, name: true, role: true, storeId: true, isActive: true },
    });
    return user;
  }

  /** manager 更新自己分店的 staff 資訊（姓名、帳號、密碼、isActive） */
  async updateStoreStaff(
    actor: AuthenticatedUser,
    storeId: number,
    staffId: number,
    input: { name?: string; username?: string; password?: string; isActive?: boolean },
  ) {
    if (!isAdminRole(actor.role) && actor.storeId !== storeId) {
      throw new AppError('PERMISSION_DENIED', '只能管理自己所屬分店的員工', 403);
    }
    const staff = await this.prisma.user.findFirst({
      where: { id: staffId, storeId, role: 'staff', deletedAt: null },
    });
    if (!staff) throw new AppError('USER_NOT_FOUND', '找不到此員工', 404);
    if (input.username) {
      const usernameTrimmed = input.username.trim().toLowerCase();
      const existing = await this.prisma.user.findFirst({ where: { username: usernameTrimmed, NOT: { id: staffId }, deletedAt: null } });
      if (existing) throw new AppError('USER_USERNAME_EXISTS', '這個帳號名稱已被使用', 409);
    }
    if (input.password !== undefined && input.password.length < 8) {
      throw new AppError('USER_PASSWORD_TOO_SHORT', '密碼至少要 8 個字元', 400);
    }
    const passwordHash = input.password ? await bcrypt.hash(input.password, 10) : undefined;
    return this.prisma.user.update({
      where: { id: staffId },
      data: {
        ...(input.name?.trim() ? { name: input.name.trim() } : {}),
        ...(input.username?.trim() ? { username: input.username.trim().toLowerCase() } : {}),
        ...(passwordHash ? { password: passwordHash } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      select: { id: true, username: true, name: true, role: true, storeId: true, isActive: true },
    });
  }

  /** manager 軟刪除自己分店的 staff */
  async deleteStoreStaff(actor: AuthenticatedUser, storeId: number, staffId: number) {
    if (!isAdminRole(actor.role) && actor.storeId !== storeId) {
      throw new AppError('PERMISSION_DENIED', '只能管理自己所屬分店的員工', 403);
    }
    const staff = await this.prisma.user.findFirst({
      where: { id: staffId, storeId, role: 'staff', deletedAt: null },
    });
    if (!staff) throw new AppError('USER_NOT_FOUND', '找不到此員工', 404);
    await this.prisma.user.update({
      where: { id: staffId },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  /** 員工帳號管理 + POS 結帳「選擇服務人員」用：回傳該分店所有員工帳號 */
  async listStoreStaff(storeId: number) {
    return this.prisma.user.findMany({
      where: { storeId, deletedAt: null },
      select: { id: true, username: true, name: true, role: true, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async updateStoreDealer(storeId: number, dealerId: number | null): Promise<StoreSummary> {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, deletedAt: null } });
    if (!store) throw new AppError('STORE_NOT_FOUND', '找不到此分店', 404);
    if (dealerId !== null) {
      const dealer = await this.prisma.user.findFirst({ where: { id: dealerId, deletedAt: null, role: 'dealer' } });
      if (!dealer) throw new AppError('DEALER_NOT_FOUND', '找不到此代理帳號', 404);
    }
    const updated = await this.prisma.store.update({
      where: { id: storeId },
      data: { dealerId },
      select: STORE_SELECT,
    });
    return toSummary(updated);
  }
}

const STORE_SELECT = {
  id: true, code: true, name: true, region: true, regionSequence: true,
  phone: true, address: true, isActive: true, dealerId: true,
  dealer: { select: { id: true, name: true } },
} satisfies Prisma.StoreSelect;

type StoreWithDealer = Prisma.StoreGetPayload<{ select: typeof STORE_SELECT }>;

function toSummary(store: StoreWithDealer): StoreSummary {
  return {
    id: store.id,
    code: store.code,
    name: store.name,
    region: store.region,
    regionSequence: store.regionSequence,
    phone: store.phone,
    address: store.address,
    isActive: store.isActive,
    dealerId: store.dealerId,
    dealerName: store.dealer?.name ?? null,
  };
}
