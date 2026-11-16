import { Injectable } from '@nestjs/common';
import { Prisma, type Region } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { buildRecordHash, hashJson, MIN_SIGNATURE_POINTS, type SignaturePoint } from '../signature/signature-hash.util';
import { canActorAccessCustomer, customerVisibilityWhere } from '../auth/role-access.util';
import { formatPhoneDisplay, normalizePhone, normalizePhoneOrNull, phoneVariants } from '../common/phone.util';
import type { AuthenticatedUser } from '../auth/types';
import {
  applySignaturesToDisclaimerPdf,
  buildDisclaimerPdf,
  DISCLAIMER_FILE_NAME,
  formatDateLabel,
  type DisclaimerHeaderData,
  type DisclaimerSection,
} from './disclaimer-pdf.util';
import { decodeBase64Png } from './document-pdf.util';
import { saveCustomerFile } from './customer-file-storage.util';
import { buildExosomeConsentPdf } from './exosome-consent-pdf.util';

/**
 * 外部列表欄位：基本識別資訊 + 歸屬資訊（區域/分店/顧客編號/建立日期）。
 * 歸屬資訊是給「能看多家店」的 admin/system_admin/dealer 用的——manager 自己只有一家店，
 * 看不看得到這幾欄差別不大，但統一回傳同一份形狀比較簡單，前端要不要顯示是 UI 層的事。
 */
export interface CustomerListItem {
  id: number;
  name: string;
  phone: string | null;
  nationalId: string | null;
  customerCode: string | null;
  storeId: number;
  storeName: string;
  createdAt: string;
}

/** 點開單一顧客才展開的完整內容（含簽署狀態），對應 Detail Drawer */
export interface CustomerDetail {
  id: number;
  name: string;
  nationalId: string | null;
  phone: string | null;
  address: string | null;
  line: string | null;
  email: string | null;
  note: string | null;
  customerCode: string | null;
  storeId: number;
  storeName: string;
  disclaimerCustomerSignedAt: string | null;
  disclaimerStaffSignedAt: string | null;
  disclaimerFullySigned: boolean;
  hasDocument: boolean;
  documentCustomerSignedAt: string | null;
  documentStaffSignedAt: string | null;
  documentFullySigned: boolean;
  canDelete: boolean;
  isExosomeUser: boolean;
  exosomeConsentSignatureUrl: string | null;
  hasExosomeConsent: boolean;
  exosomeConsentSignedAt: string | null;
  storeCredit: string;
}

interface SignaturePayloadInput {
  signatureImageUrl: string;
  signaturePoints?: SignaturePoint[];
}

interface CreateCustomerWithSignatureInput {
  name: string;
  nationalId: string;
  phone?: string;
  address?: string;
  line?: string;
  email?: string;
  note?: string;
  /** manager 角色會被強制改成自己所屬的店，這裡的值只在 admin/system_admin/dealer 建檔時才會真正採用 */
  storeId?: number;
  isExosomeUser?: boolean;
  signature: SignaturePayloadInput;
  ipAddress?: string;
  userAgent?: string;
  deviceInfo?: string;
}

/** PATCH 只允許改這幾個欄位，name/nationalId 即使出現在 payload 裡也完全不會被讀取 */
interface UpdateCustomerInput {
  phone?: string;
  address?: string;
  line?: string;
  email?: string;
  note?: string;
}

const LIST_SELECT = {
  id: true,
  name: true,
  phone: true,
  nationalId: true,
  customerCode: true,
  storeId: true,
  createdAt: true,
  store: { select: { name: true } },
} satisfies Prisma.CustomerSelect;

const DETAIL_SELECT = {
  id: true,
  name: true,
  nationalId: true,
  phone: true,
  address: true,
  line: true,
  email: true,
  note: true,
  customerCode: true,
  storeId: true,
  disclaimerCustomerSignedAt: true,
  disclaimerStaffSignedAt: true,
  documentPath: true,
  documentCustomerSignedAt: true,
  documentStaffSignedAt: true,
  isExosomeUser: true,
  exosomeConsentSignatureUrl: true,
  hasExosomeConsent: true,
  exosomeConsentSignedAt: true,
  storeCredit: true,
  store: { select: { name: true } },
} satisfies Prisma.CustomerSelect;

type ListRow = Prisma.CustomerGetPayload<{ select: typeof LIST_SELECT }>;
type DetailRow = Prisma.CustomerGetPayload<{ select: typeof DETAIL_SELECT }>;

/** 列表只取最相關的前 N 筆，確保「秒出」的體感 */
const SEARCH_RESULT_LIMIT = 30;

/** 刪除後可還原的期限：3 天 */
export const CUSTOMER_RESTORE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export interface DeletedCustomerItem {
  id: number;
  name: string;
  phone: string | null;
  customerCode: string | null;
  storeId: number;
  storeName: string;
  deletedAt: string;
  restoreDeadline: string;
  deletedBy: { id: number; name: string; username: string } | null;
}

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 對 name/phone/national_id 做不分大小寫的模糊搜尋，DB 端已建 pg_trgm GIN index。
   * customerVisibilityWhere(actor) 是跟 controller 上 @Roles guard 平行的第二道防線——
   * 即使有人想辦法繞過前端，經銷商/店長在 API 層也只查得到自己區域/分店的資料。
   * region / storeId 可選：由前端篩選器傳入，在 actor 的可見範圍內進一步縮小結果。
   */
  async searchCustomers(
    actor: AuthenticatedUser,
    search?: string,
    storeId?: number,
  ): Promise<CustomerListItem[]> {
    const trimmed = search?.trim();
    // 電話一律存純數字：關鍵字像電話（只含數字、dash、空白、+）時，去掉符號再搜尋
    const phoneQuery = trimmed && /^[\d\s\-+]+$/.test(trimmed) ? normalizePhone(trimmed) || trimmed : trimmed;

    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
      ...customerVisibilityWhere(actor),
      ...(storeId ? { storeId } : {}),
      ...(trimmed
        ? {
            OR: [
              { name: { contains: trimmed, mode: 'insensitive' } },
              { phone: { contains: phoneQuery, mode: 'insensitive' } },
              { nationalId: { contains: trimmed, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const customers = await this.prisma.customer.findMany({
      where,
      select: LIST_SELECT,
      orderBy: { createdAt: 'desc' },
      take: SEARCH_RESULT_LIMIT,
    });

    return customers.map((c) => toListItem(c));
  }

  async getCustomerDetail(actor: AuthenticatedUser, id: number): Promise<CustomerDetail> {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
      select: DETAIL_SELECT,
    });
    // 故意跟「真的不存在」回同一個錯誤碼，不讓沒有權限的人從錯誤訊息分辨出「這個 id 其實有資料，只是你看不到」
    if (!customer || !canActorAccessCustomer(actor, { storeId: customer.storeId })) {
      throw new AppError('CUSTOMER_NOT_FOUND', `customer ${id} not found or not visible to actor ${actor.id}`, 404);
    }
    return toDetail(customer);
  }

  /**
   * 建檔與簽署的不可分割交易（Version 1 的硬規定：沒簽完同意書，建檔就算失敗，
   * 系統裡不能留下「建了檔卻沒簽名」的孤兒資料）。
   *
   * 簽署順序：這一步簽的是「服務人員」（role: staff），不是顧客——業務流程是服務人員先確認
   * 條款內容、簽名，再把裝置交給顧客簽署，顧客的簽名留到之後在顧客詳情頁補簽
   * （見 CustomerDisclaimerService.signDisclaimer，那支才是顧客簽名的地方）。
   *
   * 用 prisma.$transaction 包住「建立顧客」+「產生並蓋章免責聲明書 PDF」+「寫入簽名」三件事：
   * - 簽名格式檢查（空簽名/筆觸太少）在進 transaction 前就先擋掉，連顧客都不會被建立。
   * - PDF 排版內容（template.sections + headerData）整包凍結進 contentSnapshot，
   *   之後顧客補簽（CustomerDisclaimerService.signDisclaimer）會讀回這份凍結內容
   *   重新跑一次同一個排版函式，保證簽名座標跟已經存在磁碟上的 PDF 完全對齊。
   * - 一旦進了 transaction，中途任何一步出錯（例如 national_id 在 DB 層撞到 unique constraint），
   *   Prisma 會自動把整筆（包含已經寫進去的顧客）一起 rollback；唯一例外是 PDF 檔案本身寫入磁碟
   *   這一步不在 DB transaction 範圍內（檔案系統沒有交易概念），極端情況下若交易在這之後才失敗，
   *   會留下一份沒有對應顧客紀錄的孤兒檔案——這是目前用本機磁碟儲存的已知限制，之後换成物件儲存
   *   有版本管理機制時可以解決，現階段先接受這個極小機率的風險。
   */
  async createCustomerWithSignature(actor: AuthenticatedUser, input: CreateCustomerWithSignatureInput): Promise<CustomerDetail> {
    const store = await this.resolveCreateStore(actor, input.storeId);

    if (!input.name?.trim()) {
      throw new AppError('CUSTOMER_NAME_REQUIRED', 'name is required');
    }
    if (!input.nationalId?.trim()) {
      throw new AppError('CUSTOMER_NATIONAL_ID_REQUIRED', 'nationalId is required');
    }
    if (!input.signature.signatureImageUrl) {
      throw new AppError('SIGNATURE_IMAGE_MISSING', 'signature image url is required');
    }
    if (input.signature.signaturePoints && input.signature.signaturePoints.length < MIN_SIGNATURE_POINTS) {
      throw new AppError('SIGNATURE_TOO_SMALL', 'signature stroke has too few points');
    }

    // 提早正規化大小寫，下面的重複檢查跟最終存檔（含顧客編號拼接）都用同一個值，
    // 避免 "a123456789" 跟 "A123456789"被當成兩個不同人通過重複檢查。
    const normalizedNationalId = input.nationalId.trim().toUpperCase();
    // 電話一律存純數字（0981-675-415 → 0981675415），重複檢查也用同一個值
    const phone = normalizePhoneOrNull(input.phone);

    if (phone) {
      const existingPhone = await this.prisma.customer.findFirst({
        where: { phone: { in: phoneVariants(phone) }, deletedAt: null },
        select: { id: true },
      });
      if (existingPhone) {
        throw new AppError('CUSTOMER_PHONE_EXISTS', `phone ${phone} already exists`, 409);
      }
    }

    const existingNationalId = await this.prisma.customer.findFirst({
      where: { nationalId: normalizedNationalId, deletedAt: null },
      select: { id: true },
    });
    if (existingNationalId) {
      throw new AppError('CUSTOMER_NATIONAL_ID_EXISTS', `national id ${normalizedNationalId} already exists`, 409);
    }

    const template = await this.prisma.disclaimerTemplate.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!template) {
      throw new AppError('DISCLAIMER_TEMPLATE_NOT_FOUND', 'no active disclaimer template', 404);
    }

    // 顧客編號規則：[店家編號]-[身分證字號]（例如掛在 N01 的 A123456789 → N01-A123456789）。
    // nationalId 本身在上面已經查過全系統唯一，所以這個拼接結果天生唯一，不需要額外加鎖。
    const customerCode = `${store.code}-${normalizedNationalId}`;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const customer = await tx.customer.create({
          data: {
            name: input.name.trim(),
            nationalId: normalizedNationalId,
            customerCode,
            phone,
            address: input.address,
            line: input.line,
            email: input.email,
            note: input.note,
            storeId: store.id,
            createdBy: actor.id,
            isExosomeUser: input.isExosomeUser ?? false,
          },
        });

        const headerData: DisclaimerHeaderData = {
          customerName: customer.name,
          customerCode: customer.customerCode,
          nationalId: customer.nationalId ?? input.nationalId,
          phone: formatPhoneDisplay(customer.phone),
          address: customer.address,
          storeName: store.name,
          storeCode: store.code,
        };
        const sections = template.sections as unknown as DisclaimerSection[];

        const { pdfBytes, anchors } = await buildDisclaimerPdf({ title: template.title, sections }, headerData);

        const signedAt = new Date();
        // 簽署順序對調：建檔當下先由「服務人員」簽（role: 'staff'），顧客的簽名留到之後
        // 在顧客詳情頁補簽（見 CustomerDisclaimerService.signDisclaimer）——業務流程上是
        // 服務人員先確認條款內容沒問題並簽名，再把裝置交給顧客簽署，不是反過來。
        const signedPdfBytes = await applySignaturesToDisclaimerPdf(pdfBytes, anchors, [
          {
            role: 'staff',
            signaturePngBytes: decodeBase64Png(input.signature.signatureImageUrl),
            dateLabel: formatDateLabel(signedAt),
          },
        ]);

        // 先確保 PDF 真的寫成功，才讓 DB 記下「已簽署」（跟 id_document 流程一致的安全順序）。
        const disclaimerPath = await saveCustomerFile(customer.id, DISCLAIMER_FILE_NAME, signedPdfBytes);

        const contentSnapshot = {
          templateVersion: template.version,
          title: template.title,
          sections,
          headerData,
          signerRole: 'staff',
          signedAt: signedAt.toISOString(),
        };
        const contentHash = hashJson(contentSnapshot);
        const recordHash = buildRecordHash({
          customerId: customer.id,
          documentType: 'disclaimer',
          signerRole: 'staff',
          contentHash,
          signatureImageUrl: input.signature.signatureImageUrl,
          signedAt: signedAt.toISOString(),
        });

        await tx.signature.create({
          data: {
            customerId: customer.id,
            documentType: 'disclaimer',
            signerRole: 'staff',
            signerUserId: actor.id,
            signatureImageUrl: input.signature.signatureImageUrl,
            signaturePointsJson: input.signature.signaturePoints as Prisma.InputJsonValue | undefined,
            contentSnapshot: contentSnapshot as unknown as Prisma.InputJsonValue,
            contentHash,
            recordHash,
            signedAt,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
            deviceInfo: input.deviceInfo,
          },
        });

        const updated = await tx.customer.update({
          where: { id: customer.id },
          data: { disclaimerStaffSignedAt: signedAt, disclaimerStaffId: actor.id, disclaimerPath },
          select: DETAIL_SELECT,
        });

        return toDetail(updated);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = (error.meta?.target as string[] | undefined)?.join(',') ?? '';
        if (target.includes('national_id')) {
          throw new AppError('CUSTOMER_NATIONAL_ID_EXISTS', 'national id already exists', 409);
        }
        throw new AppError('CUSTOMER_DUPLICATE', 'duplicate customer', 409);
      }
      throw error;
    }
  }

  /**
   * 決定這次建檔要落在哪間店。注意：建立顧客這個方法現在只有 system_admin/admin/manager
   * 能呼叫到（見 customers.controller.ts 的 @Roles('manager') override，dealer 在 Guard 那層
   * 就被擋掉了，連這個方法都進不來），所以這裡不需要、也不該再保留「驗證 dealer 區域」的分支：
   * - manager 永遠用自己所屬的店，body 帶來的 storeId 一律忽略（避免越權建到別的店）
   * - admin/system_admin 必須指定 storeId（他們自己沒有固定門店），並驗證該店真的存在
   */
  private async resolveCreateStore(actor: AuthenticatedUser, requestedStoreId?: number) {
    // manager 和 staff 都強制使用自己所屬的分店（避免越權建到別的店）
    if (actor.role === 'manager' || actor.role === 'staff') {
      if (!actor.storeId) {
        throw new AppError('STORE_REQUIRED', `${actor.role} ${actor.id} has no assigned store`, 500);
      }
      const store = await this.prisma.store.findFirst({ where: { id: actor.storeId, deletedAt: null } });
      if (!store) {
        throw new AppError('STORE_REQUIRED', 'assigned store no longer exists', 500);
      }
      return store;
    }

    // 單一門市模式：admin/system_admin 沒指定分店時，用自己所屬的店；自己也沒有所屬店時，
    // 系統裡只有一家門市就直接用那家（介面已不再顯示分店選擇）。
    let storeId = requestedStoreId ?? actor.storeId ?? undefined;
    if (!storeId) {
      const stores = await this.prisma.store.findMany({ where: { deletedAt: null }, select: { id: true }, take: 2 });
      if (stores.length !== 1) {
        throw new AppError('STORE_REQUIRED', 'storeId is required when there is not exactly one store', 400);
      }
      storeId = stores[0].id;
    }

    const store = await this.prisma.store.findFirst({ where: { id: storeId, deletedAt: null } });
    if (!store) {
      throw new AppError('STORE_NOT_FOUND', 'selected store does not exist', 404);
    }
    return store;
  }

  /**
   * 核心識別個資終身鎖定：這個方法的參數型別本身就沒有 name/nationalId 兩個欄位，
   * 就算 controller 哪天手滑把整包 request body 直接傳進來，這裡解構時也只會取
   * phone/address/line/email/note，name/nationalId 永遠不會被讀到、更不會被寫進 DB。
   */
  /**
   * 快速建立非外泌體顧客（無需簽署免責聲明書）。
   * 必填：name + phone；nationalId 選填。
   * 若後續勾選外泌體，可在顧客詳情頁補填聲明書。
   */
  async createQuickCustomer(
    actor: AuthenticatedUser,
    input: {
      name: string;
      phone: string;
      nationalId?: string;
      address?: string;
      line?: string;
      email?: string;
      note?: string;
      storeId?: number;
    },
  ): Promise<CustomerDetail> {
    const store = await this.resolveCreateStore(actor, input.storeId);
    if (!input.name?.trim()) throw new AppError('CUSTOMER_NAME_REQUIRED', 'name is required');
    const phone = normalizePhone(input.phone);
    if (!phone) throw new AppError('CUSTOMER_PHONE_REQUIRED', '電話為必填欄位');

    const existingPhone = await this.prisma.customer.findFirst({
      where: { phone: { in: phoneVariants(phone) }, storeId: store.id, deletedAt: null },
    });
    if (existingPhone) throw new AppError('CUSTOMER_PHONE_EXISTS', `phone ${phone} already exists`, 409);

    const customer = await this.prisma.customer.create({
      data: {
        name: input.name.trim(),
        phone,
        nationalId: input.nationalId?.trim().toUpperCase() || null,
        address: input.address,
        line: input.line,
        email: input.email,
        note: input.note,
        storeId: store.id,
        createdBy: actor.id,
        isExosomeUser: false,
      },
      select: DETAIL_SELECT,
    });
    return toDetail(customer);
  }

  async updateCustomer(actor: AuthenticatedUser, id: number, input: UpdateCustomerInput): Promise<CustomerDetail> {
    const existing = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, phone: true, nationalId: true, storeId: true },
    });
    if (!existing || !canActorAccessCustomer(actor, { storeId: existing.storeId })) {
      throw new AppError('CUSTOMER_NOT_FOUND', `customer ${id} not found or not visible to actor ${actor.id}`, 404);
    }

    // phone 欄位有傳才更新；一律存純數字，空字串視為清除
    const phone = input.phone === undefined ? undefined : normalizePhoneOrNull(input.phone);
    if (phone && phone !== normalizePhone(existing.phone)) {
      const duplicatePhone = await this.prisma.customer.findFirst({
        where: { phone: { in: phoneVariants(phone) }, deletedAt: null, id: { not: id } },
        select: { id: true },
      });
      if (duplicatePhone) {
        throw new AppError('CUSTOMER_PHONE_EXISTS', `phone ${phone} already exists`, 409);
      }
    }

    const { address, line, email, note, isExosomeUser } = input as typeof input & { isExosomeUser?: boolean };
    const inputNationalId = (input as { nationalId?: string }).nationalId;

    // nationalId 僅允許「補填」（目前為 null 才能設定），不允許修改已有的值
    let nationalIdUpdate: string | undefined;
    if (inputNationalId?.trim()) {
      if (existing.nationalId) {
        throw new AppError('CUSTOMER_NATIONAL_ID_LOCKED', '身分證字號已填寫，無法修改', 409);
      }
      nationalIdUpdate = inputNationalId.trim().toUpperCase();
    }

    const updated = await this.prisma.customer.update({
      where: { id },
      data: {
        phone, address, line, email, note,
        ...(isExosomeUser !== undefined ? { isExosomeUser } : {}),
        ...(nationalIdUpdate ? { nationalId: nationalIdUpdate } : {}),
      },
      select: DETAIL_SELECT,
    });

    return toDetail(updated);
  }

  /**
   * 軟刪除：顧客有簽名/文件/庫存異動等歷史紀錄掛在身上，刪掉資料列會讓那些紀錄斷掉關聯，
   * 所以只設 deletedAt（+ deletedById），跟既有的查詢慣例（所有顧客查詢都帶 `deletedAt: null`）一致。
   *
   * 權限（controller 已用 @Roles('manager') 擋掉 staff/dealer，這裡再做資料層檢查）：
   * - manager 只能刪自己分店的顧客；admin/system_admin 不限分店。
   * - 顧客還有「未用完的課程堂數」或「儲值金／贈送金／抵用金餘額」時，只有 system_admin 能刪，
   *   避免門市誤刪掉顧客還沒用完、已經付過錢的權益。
   * 刪除後 CUSTOMER_RESTORE_WINDOW_MS（3 天）內可用 restoreCustomer 還原。
   */
  async deleteCustomer(actor: AuthenticatedUser, id: number): Promise<void> {
    const existing = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        storeId: true,
        storeCredit: true,
        wallet: { select: { balance: true, bonusBalance: true } },
        customerCourses: { select: { totalSessions: true, usedSessions: true } },
      },
    });
    if (!existing || !canActorAccessCustomer(actor, { storeId: existing.storeId })) {
      throw new AppError('CUSTOMER_NOT_FOUND', `customer ${id} not found or not visible to actor ${actor.id}`, 404);
    }

    const hasRemainingCourses = existing.customerCourses.some((c) => c.totalSessions - c.usedSessions > 0);
    const hasRemainingBalance =
      (existing.wallet?.balance ?? 0) > 0 ||
      (existing.wallet?.bonusBalance ?? 0) > 0 ||
      existing.storeCredit.greaterThan(0);
    if ((hasRemainingCourses || hasRemainingBalance) && actor.role !== 'system_admin') {
      throw new AppError(
        'CUSTOMER_HAS_REMAINING_VALUE',
        `customer ${id} still has unused courses or balance; only system_admin can delete`,
        403,
      );
    }

    await this.prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: actor.id },
    });
  }

  /** 最近 3 天內被刪除、actor 看得到的顧客（給「最近刪除」清單用），越晚刪的排越前面 */
  async listRecentlyDeleted(actor: AuthenticatedUser): Promise<DeletedCustomerItem[]> {
    const since = new Date(Date.now() - CUSTOMER_RESTORE_WINDOW_MS);
    const rows = await this.prisma.customer.findMany({
      where: { deletedAt: { gte: since }, ...customerVisibilityWhere(actor) },
      select: {
        id: true,
        name: true,
        phone: true,
        customerCode: true,
        deletedAt: true,
        store: { select: { id: true, name: true } },
        deletedBy: { select: { id: true, name: true, username: true } },
      },
      orderBy: { deletedAt: 'desc' },
      take: SEARCH_RESULT_LIMIT,
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      customerCode: r.customerCode,
      storeId: r.store.id,
      storeName: r.store.name,
      deletedAt: r.deletedAt!.toISOString(),
      restoreDeadline: new Date(r.deletedAt!.getTime() + CUSTOMER_RESTORE_WINDOW_MS).toISOString(),
      deletedBy: r.deletedBy ? { id: r.deletedBy.id, name: r.deletedBy.name, username: r.deletedBy.username } : null,
    }));
  }

  /**
   * 還原軟刪除的顧客：只能在刪除後 3 天內還原，超過期限一律拒絕（資料仍保留在 DB，不做實體刪除）。
   * 還原前再檢查一次電話/身分證是否已被「刪除期間新建的顧客」用掉，避免還原後出現重複顧客。
   */
  async restoreCustomer(actor: AuthenticatedUser, id: number): Promise<CustomerDetail> {
    const existing = await this.prisma.customer.findFirst({
      where: { id, deletedAt: { not: null } },
      select: { id: true, storeId: true, phone: true, nationalId: true, deletedAt: true },
    });
    if (!existing || !canActorAccessCustomer(actor, { storeId: existing.storeId })) {
      throw new AppError('CUSTOMER_NOT_FOUND', `deleted customer ${id} not found or not visible to actor ${actor.id}`, 404);
    }
    if (Date.now() - existing.deletedAt!.getTime() > CUSTOMER_RESTORE_WINDOW_MS) {
      throw new AppError('CUSTOMER_RESTORE_EXPIRED', `customer ${id} was deleted more than 3 days ago`, 409);
    }

    if (existing.phone) {
      const dup = await this.prisma.customer.findFirst({
        where: { phone: existing.phone, deletedAt: null, id: { not: id } },
        select: { id: true },
      });
      if (dup) throw new AppError('CUSTOMER_PHONE_EXISTS', `phone ${existing.phone} already used by customer ${dup.id}`, 409);
    }
    if (existing.nationalId) {
      const dup = await this.prisma.customer.findFirst({
        where: { nationalId: existing.nationalId, deletedAt: null, id: { not: id } },
        select: { id: true },
      });
      if (dup) throw new AppError('CUSTOMER_NATIONAL_ID_EXISTS', `nationalId already used by customer ${dup.id}`, 409);
    }

    const restored = await this.prisma.customer.update({
      where: { id },
      data: { deletedAt: null, deletedById: null },
      select: DETAIL_SELECT,
    });
    return toDetail(restored);
  }

  /**
   * POS 扣堂選擇器：列出顧客名下尚有剩餘堂數的課程。
   * 前端用此端點動態呈現「顧客可扣哪些課程的哪幾堂」，讓店員挑選。
   */
  async getCustomerWallet(actor: AuthenticatedUser, customerId: number) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: { storeId: true, store: true },
    });
    if (!customer) throw new AppError('CUSTOMER_NOT_FOUND', '找不到此顧客', 404);
    if (!canActorAccessCustomer(actor, { storeId: customer.storeId })) {
      throw new AppError('PERMISSION_DENIED', '無權限存取此顧客資料', 403);
    }
    const wallet = await this.prisma.customerWallet.findUnique({ where: { customerId } });
    return {
      balance: wallet?.balance ?? 0,
      bonusBalance: wallet?.bonusBalance ?? 0,
      total: (wallet?.balance ?? 0) + (wallet?.bonusBalance ?? 0),
    };
  }

  async topUpWallet(
    actor: AuthenticatedUser,
    customerId: number,
    input: { amount: number; paymentMethod: string; note?: string },
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: { storeId: true, store: true },
    });
    if (!customer) throw new AppError('CUSTOMER_NOT_FOUND', '找不到此顧客', 404);
    if (!canActorAccessCustomer(actor, { storeId: customer.storeId })) {
      throw new AppError('PERMISSION_DENIED', '無權限存取此顧客資料', 403);
    }
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new AppError('FINANCIAL_INVALID_AMOUNT', '儲值金額必須為正整數', 400);
    }

    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.customerWallet.upsert({
        where: { customerId },
        create: { customerId, balance: input.amount, bonusBalance: 0 },
        update: { balance: { increment: input.amount } },
      });
      await tx.walletLog.create({
        data: {
          customerId,
          storeId: customer.storeId,
          type: 'top_up',
          amount: input.amount,
          bonusAmount: 0,
          performedById: actor.id,
          note: input.note ?? '直接儲值',
        },
      });
      await tx.financialRecord.create({
        data: {
          storeId: customer.storeId,
          type: 'income',
          category: 'top_up',
          amount: input.amount,
          paymentMethod: input.paymentMethod as never,
          performedById: actor.id,
          description: `顧客 #${customerId} 直接儲值`,
        },
      });
      if (input.paymentMethod === 'cash') {
        await tx.store.update({
          where: { id: customer.storeId },
          data: { pettyCashBalance: { increment: input.amount } },
        });
      }
      return { balance: wallet.balance, bonusBalance: wallet.bonusBalance };
    });
  }

  async listCustomerCourses(actor: AuthenticatedUser, customerId: number) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: { storeId: true, store: true },
    });
    if (!customer) throw new AppError('CUSTOMER_NOT_FOUND', '找不到此顧客', 404);
    if (!canActorAccessCustomer(actor, { storeId: customer.storeId })) {
      throw new AppError('PERMISSION_DENIED', '無權限存取此顧客資料', 403);
    }

    const courses = await this.prisma.customerCourse.findMany({
      where: {
        customerId,
        usedSessions: { lt: this.prisma.customerCourse.fields.totalSessions },
      },
      include: {
        serviceItem: { select: { id: true, name: true, price: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return courses
      .filter((c) => c.usedSessions < c.totalSessions)
      .map((c) => ({
        id: c.id,
        serviceItem: c.serviceItem,
        totalSessions: c.totalSessions,
        usedSessions: c.usedSessions,
        remainingSessions: c.totalSessions - c.usedSessions,
        purchasePrice: c.purchasePrice ?? null,
        createdAt: c.createdAt.toISOString(),
      }));
  }

  /** 舊顧客補簽外泌體使用同意書（不覆蓋建檔日期與基本資料） */
  async signExosomeConsent(
    actor: AuthenticatedUser,
    customerId: number,
    input: { signatureUrl: string; signaturePoints?: unknown[]; notes?: string },
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: {
        id: true, storeId: true, hasExosomeConsent: true, nationalId: true, customerCode: true,
        store: { select: { code: true } },
      },
    });
    if (!customer) throw new AppError('CUSTOMER_NOT_FOUND', '找不到此顧客', 404);
    if (!canActorAccessCustomer(actor, { storeId: customer.storeId })) {
      throw new AppError('PERMISSION_DENIED', '無權限存取此顧客資料', 403);
    }
    if (customer.hasExosomeConsent) {
      throw new AppError('EXOSOME_CONSENT_ALREADY_SIGNED', '此顧客已完成外泌體同意書補簽', 409);
    }

    // 補簽完成後，若顧客還沒有 customerCode 且有身分證字號，依 [店號]-[身分證] 格式補上
    const newCustomerCode =
      !customer.customerCode && customer.nationalId
        ? `${customer.store.code}-${customer.nationalId}`
        : undefined;

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.exosomeConsentLog.create({
        data: {
          customerId,
          signedAt: now,
          signatureUrl: input.signatureUrl,
          signaturePoints: input.signaturePoints as object[] | undefined,
          operatorId: actor.id,
          notes: input.notes,
        },
      }),
      this.prisma.customer.update({
        where: { id: customerId },
        data: {
          hasExosomeConsent: true,
          exosomeConsentSignedAt: now,
          isExosomeUser: true,
          exosomeConsentSignatureUrl: input.signatureUrl,
          ...(newCustomerCode ? { customerCode: newCustomerCode } : {}),
        },
      }),
    ]);

    return { success: true, signedAt: now.toISOString() };
  }

  async getExosomeConsentPdf(actor: AuthenticatedUser, customerId: number): Promise<Buffer> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: {
        id: true, name: true, nationalId: true, phone: true, customerCode: true,
        hasExosomeConsent: true,
        exosomeConsentSignedAt: true,
        exosomeConsentSignatureUrl: true,
        storeId: true,
        store: { select: { name: true } },
      },
    });
    if (!customer) throw new AppError('CUSTOMER_NOT_FOUND', '找不到此顧客', 404);
    if (!canActorAccessCustomer(actor, { storeId: customer.storeId })) {
      throw new AppError('PERMISSION_DENIED', '無權限存取此顧客資料', 403);
    }
    if (!customer.hasExosomeConsent || !customer.exosomeConsentSignedAt) {
      throw new AppError('EXOSOME_CONSENT_NOT_SIGNED', '此顧客尚未完成外泌體同意書補簽', 404);
    }

    return buildExosomeConsentPdf({
      customerName: customer.name,
      customerCode: customer.customerCode,
      nationalId: customer.nationalId,
      phone: formatPhoneDisplay(customer.phone),
      storeName: customer.store.name,
      signedAt: customer.exosomeConsentSignedAt,
      signatureImageUrl: customer.exosomeConsentSignatureUrl,
    });
  }
}

function toListItem(customer: ListRow): CustomerListItem {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    nationalId: customer.nationalId,
    customerCode: customer.customerCode,
    storeId: customer.storeId,
    storeName: customer.store.name,
    createdAt: customer.createdAt.toISOString(),
  };
}

function toDetail(customer: DetailRow): CustomerDetail {
  const disclaimerFullySigned = Boolean(customer.disclaimerCustomerSignedAt && customer.disclaimerStaffSignedAt);
  const documentFullySigned = Boolean(customer.documentCustomerSignedAt && customer.documentStaffSignedAt);
  return {
    id: customer.id,
    name: customer.name,
    nationalId: customer.nationalId,
    phone: customer.phone,
    address: customer.address,
    line: customer.line,
    email: customer.email,
    note: customer.note,
    customerCode: customer.customerCode,
    storeId: customer.storeId,
    storeName: customer.store.name,
    disclaimerCustomerSignedAt: customer.disclaimerCustomerSignedAt?.toISOString() ?? null,
    disclaimerStaffSignedAt: customer.disclaimerStaffSignedAt?.toISOString() ?? null,
    disclaimerFullySigned,
    hasDocument: Boolean(customer.documentPath),
    documentCustomerSignedAt: customer.documentCustomerSignedAt?.toISOString() ?? null,
    documentStaffSignedAt: customer.documentStaffSignedAt?.toISOString() ?? null,
    documentFullySigned,
    // 沿用 cms 的規則：雙方都簽完同意書後就不能再刪除（一律先擋，RBAC 上線後再依角色放寬）。
    canDelete: !disclaimerFullySigned,
    isExosomeUser: customer.isExosomeUser,
    exosomeConsentSignatureUrl: customer.exosomeConsentSignatureUrl,
    hasExosomeConsent: customer.hasExosomeConsent,
    exosomeConsentSignedAt: customer.exosomeConsentSignedAt?.toISOString() ?? null,
    storeCredit: customer.storeCredit.toString(),
  };
}
