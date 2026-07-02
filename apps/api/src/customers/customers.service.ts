import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { buildRecordHash, hashJson, MIN_SIGNATURE_POINTS, type SignaturePoint } from '../signature/signature-hash.util';
import { canActorAccessCustomer, customerVisibilityWhere } from '../auth/role-access.util';
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
  storeName: string;
  region: string;
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
  createdAt: true,
  store: { select: { name: true, region: true } },
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
  store: { select: { name: true, region: true } },
} satisfies Prisma.CustomerSelect;

type ListRow = Prisma.CustomerGetPayload<{ select: typeof LIST_SELECT }>;
type DetailRow = Prisma.CustomerGetPayload<{ select: typeof DETAIL_SELECT }>;

/** 列表只取最相關的前 N 筆，確保「秒出」的體感 */
const SEARCH_RESULT_LIMIT = 30;

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 對 name/phone/national_id 做不分大小寫的模糊搜尋，DB 端已建 pg_trgm GIN index。
   * customerVisibilityWhere(actor) 是跟 controller 上 @Roles guard 平行的第二道防線——
   * 即使有人想辦法繞過前端，經銷商/店長在 API 層也只查得到自己區域/分店的資料。
   */
  async searchCustomers(actor: AuthenticatedUser, search?: string): Promise<CustomerListItem[]> {
    const trimmed = search?.trim();

    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
      ...customerVisibilityWhere(actor),
      ...(trimmed
        ? {
            OR: [
              { name: { contains: trimmed, mode: 'insensitive' } },
              { phone: { contains: trimmed, mode: 'insensitive' } },
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

    return customers.map(toListItem);
  }

  async getCustomerDetail(actor: AuthenticatedUser, id: number): Promise<CustomerDetail> {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
      select: DETAIL_SELECT,
    });
    // 故意跟「真的不存在」回同一個錯誤碼，不讓沒有權限的人從錯誤訊息分辨出「這個 id 其實有資料，只是你看不到」
    if (!customer || !canActorAccessCustomer(actor, { storeId: customer.storeId, storeRegion: customer.store.region })) {
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

    if (input.phone) {
      const existingPhone = await this.prisma.customer.findFirst({
        where: { phone: input.phone, deletedAt: null },
        select: { id: true },
      });
      if (existingPhone) {
        throw new AppError('CUSTOMER_PHONE_EXISTS', `phone ${input.phone} already exists`, 409);
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
            phone: input.phone,
            address: input.address,
            line: input.line,
            email: input.email,
            note: input.note,
            storeId: store.id,
            createdBy: actor.id,
          },
        });

        const headerData: DisclaimerHeaderData = {
          customerName: customer.name,
          customerCode: customer.customerCode,
          nationalId: customer.nationalId ?? input.nationalId,
          phone: customer.phone,
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
    if (actor.role === 'manager') {
      if (!actor.storeId) {
        throw new AppError('STORE_REQUIRED', `manager ${actor.id} has no assigned store`, 500);
      }
      const store = await this.prisma.store.findFirst({ where: { id: actor.storeId, deletedAt: null } });
      if (!store) {
        throw new AppError('STORE_REQUIRED', 'manager assigned store no longer exists', 500);
      }
      return store;
    }

    if (!requestedStoreId) {
      throw new AppError('STORE_REQUIRED', 'storeId is required for this role', 400);
    }

    const store = await this.prisma.store.findFirst({ where: { id: requestedStoreId, deletedAt: null } });
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
  async updateCustomer(actor: AuthenticatedUser, id: number, input: UpdateCustomerInput): Promise<CustomerDetail> {
    const existing = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, phone: true, storeId: true, store: { select: { region: true } } },
    });
    if (!existing || !canActorAccessCustomer(actor, { storeId: existing.storeId, storeRegion: existing.store.region })) {
      throw new AppError('CUSTOMER_NOT_FOUND', `customer ${id} not found or not visible to actor ${actor.id}`, 404);
    }

    if (input.phone && input.phone !== existing.phone) {
      const duplicatePhone = await this.prisma.customer.findFirst({
        where: { phone: input.phone, deletedAt: null, id: { not: id } },
        select: { id: true },
      });
      if (duplicatePhone) {
        throw new AppError('CUSTOMER_PHONE_EXISTS', `phone ${input.phone} already exists`, 409);
      }
    }

    const { phone, address, line, email, note } = input;
    const updated = await this.prisma.customer.update({
      where: { id },
      data: { phone, address, line, email, note },
      select: DETAIL_SELECT,
    });

    return toDetail(updated);
  }

  /**
   * 軟刪除：顧客有簽名/文件/庫存異動等歷史紀錄掛在身上，刪掉資料列會讓那些紀錄斷掉關聯，
   * 所以只設 deletedAt，跟既有的查詢慣例（所有顧客查詢都帶 `deletedAt: null`）一致——
   * 軟刪後這個顧客就會自動從搜尋/清單裡消失，不需要額外改任何查詢邏輯。
   * 這支只允許 admin/system_admin 呼叫（見 CustomersController 對這支路由的 @Roles('admin') 覆寫），
   * 所以不需要再用 canActorAccessCustomer 檢查區域/分店範圍。
   */
  async deleteCustomer(id: number): Promise<void> {
    const existing = await this.prisma.customer.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!existing) {
      throw new AppError('CUSTOMER_NOT_FOUND', `customer ${id} not found`, 404);
    }
    await this.prisma.customer.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}

function toListItem(customer: ListRow): CustomerListItem {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    nationalId: customer.nationalId,
    customerCode: customer.customerCode,
    storeName: customer.store.name,
    region: customer.store.region,
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
  };
}
