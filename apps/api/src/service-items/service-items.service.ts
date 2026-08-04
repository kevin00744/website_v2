import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { isAdminRole } from '../auth/role-access.util';
import type { AuthenticatedUser } from '../auth/types';

export interface CreateServiceItemInput {
  name: string;
  price: number;
  isOutsourced?: boolean;
  outsourceCost?: number;
}

const ITEM_SELECT = {
  id: true,
  storeId: true,
  name: true,
  price: true,
  isOutsourced: true,
  outsourceCost: true,
  isActive: true,
  createdAt: true,
} as const;

@Injectable()
export class ServiceItemsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * POS 結帳選單用：全域通用項目（storeId=null）＋ 該分店自訂項目，
   * 過濾下架與軟刪除。
   */
  async listForStore(storeId: number) {
    return this.prisma.serviceItem.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        OR: [{ storeId: null }, { storeId }],
      },
      select: ITEM_SELECT,
      orderBy: [{ storeId: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * 分店品項管理用：只回傳該分店「自己建立的」品項（不含全域通用項目）。
   * manager 限查自己的分店；admin 可查任意分店。
   */
  async listOwnedByStore(actor: AuthenticatedUser, storeId: number) {
    this.assertStoreAccess(actor, storeId);
    return this.prisma.serviceItem.findMany({
      where: { storeId, deletedAt: null },
      select: ITEM_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * 建立分店品項。manager 操作時 storeId 強制鎖定為其所屬分店，無法越權。
   */
  async create(actor: AuthenticatedUser, storeId: number, input: CreateServiceItemInput) {
    this.assertStoreAccess(actor, storeId);
    if (!input.name.trim()) throw new AppError('SERVICE_ITEM_NAME_REQUIRED', '品項名稱不能空白', 400);
    if (!Number.isInteger(input.price) || input.price <= 0) {
      throw new AppError('SERVICE_ITEM_INVALID_PRICE', '售價必須為正整數', 400);
    }
    if (input.isOutsourced && input.outsourceCost !== undefined) {
      if (!Number.isInteger(input.outsourceCost) || input.outsourceCost < 0) {
        throw new AppError('SERVICE_ITEM_INVALID_OUTSOURCE_COST', '外包成本必須為非負整數', 400);
      }
    }

    const store = await this.prisma.store.findFirst({ where: { id: storeId, deletedAt: null } });
    if (!store) throw new AppError('STORE_NOT_FOUND', '找不到此分店', 404);

    return this.prisma.serviceItem.create({
      data: {
        storeId,
        name: input.name.trim(),
        price: input.price,
        isOutsourced: input.isOutsourced ?? false,
        outsourceCost: input.isOutsourced ? (input.outsourceCost ?? null) : null,
      },
      select: ITEM_SELECT,
    });
  }

  /** 更新品項基本資訊（名稱、售價、外包設定） */
  async update(
    actor: AuthenticatedUser,
    storeId: number,
    itemId: number,
    input: Partial<CreateServiceItemInput>,
  ) {
    this.assertStoreAccess(actor, storeId);
    const item = await this.prisma.serviceItem.findFirst({ where: { id: itemId, storeId, deletedAt: null } });
    if (!item) throw new AppError('SERVICE_ITEM_NOT_FOUND', '找不到此品項', 404);
    if (input.price !== undefined && (!Number.isInteger(input.price) || input.price <= 0)) {
      throw new AppError('SERVICE_ITEM_INVALID_PRICE', '售價必須為正整數', 400);
    }
    return this.prisma.serviceItem.update({
      where: { id: itemId },
      data: {
        ...(input.name?.trim() ? { name: input.name.trim() } : {}),
        ...(input.price !== undefined ? { price: input.price } : {}),
        ...(input.isOutsourced !== undefined ? { isOutsourced: input.isOutsourced } : {}),
        ...(input.outsourceCost !== undefined ? { outsourceCost: input.outsourceCost } : {}),
      },
      select: ITEM_SELECT,
    });
  }

  /** 軟刪除下架，manager 限操作自己的分店品項 */
  async deactivate(actor: AuthenticatedUser, storeId: number, itemId: number) {
    this.assertStoreAccess(actor, storeId);
    const item = await this.prisma.serviceItem.findFirst({ where: { id: itemId, storeId, deletedAt: null } });
    if (!item) throw new AppError('SERVICE_ITEM_NOT_FOUND', '找不到此品項', 404);
    await this.prisma.serviceItem.update({ where: { id: itemId }, data: { deletedAt: new Date() } });
  }

  private assertStoreAccess(actor: AuthenticatedUser, storeId: number) {
    if (isAdminRole(actor.role)) return;
    if (actor.role === 'manager' && actor.storeId !== storeId) {
      throw new AppError('PERMISSION_DENIED', '只能管理自己所屬分店的品項', 403);
    }
    if (actor.role !== 'manager') {
      throw new AppError('PERMISSION_DENIED', '無操作權限', 403);
    }
  }
}
