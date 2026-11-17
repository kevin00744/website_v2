import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { assertSignaturePayloadValid, buildRecordHash, hashJson, type SignaturePoint } from '../signature/signature-hash.util';
import { canActorAccessCustomer } from '../auth/role-access.util';
import type { AuthenticatedUser } from '../auth/types';
import {
  applySignaturesToDisclaimerPdf,
  buildDisclaimerPdf,
  CURRENT_LAYOUT_VERSION,
  DISCLAIMER_FILE_NAME,
  formatDateLabel,
  type DisclaimerHeaderData,
  type DisclaimerSection,
} from './disclaimer-pdf.util';
import { decodeBase64Png } from './document-pdf.util';
import { loadCustomerFile, saveCustomerFile } from './customer-file-storage.util';
import { formatPhoneDisplay } from '../common/phone.util';

const VISIBILITY_SELECT = { storeId: true } as const;

interface SignDisclaimerInput {
  signatureImageUrl: string;
  signaturePoints?: SignaturePoint[];
  ipAddress?: string;
  userAgent?: string;
  deviceInfo?: string;
}

export interface DisclaimerStatus {
  hasDisclaimer: boolean;
  disclaimerCustomerSignedAt: string | null;
  disclaimerStaffSignedAt: string | null;
  disclaimerFullySigned: boolean;
}

interface FrozenDisclaimerSnapshot {
  templateVersion: string;
  title: string;
  sections: DisclaimerSection[];
  headerData: DisclaimerHeaderData;
  /** 版面版本；舊快照沒有這個欄位，視為 1（見 disclaimer-pdf.util.ts CURRENT_LAYOUT_VERSION） */
  layoutVersion?: number;
}

/**
 * 服務人員事後補簽免責聲明書（用於非外泌體顧客後來改為使用外泌體的情境）：
 * 複製 createCustomerWithSignature 裡的服務人員簽署邏輯，作為獨立的可重入操作。
 * 完成後同步將顧客 isExosomeUser 標記為 true。
 */

/**
 * 服務人員那一次簽名已經在 CustomersService.createCustomerWithSignature 裡完成
 * （建檔跟服務人員簽署是同一筆 transaction，見該方法的說明）。這個 service 負責「顧客之後補簽」，
 * 平行於 CustomerDocumentService 處理 id_document 的雙簽署模式——順序對調：服務人員先簽、
 * 顧客後簽，業務考量是服務人員要先確認條款內容跟顧客資料無誤，再把裝置交給顧客本人簽名。
 */
@Injectable()
export class CustomerDisclaimerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 服務人員事後補簽免責聲明書（for 非外泌體轉換為外泌體使用者的情境）。
   * 建立 PDF、寫入服務人員簽名、設定 disclaimerStaffSignedAt、並將 isExosomeUser 標記為 true。
   */
  async signStaffDisclaimer(actor: AuthenticatedUser, customerId: number, input: SignDisclaimerInput): Promise<DisclaimerStatus> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: {
        id: true, name: true, phone: true, nationalId: true, address: true,
        customerCode: true,
        disclaimerStaffSignedAt: true,
        storeId: true,
        store: { select: { name: true, code: true } },
      },
    });
    if (!customer || !canActorAccessCustomer(actor, { storeId: customer.storeId })) {
      throw new AppError('CUSTOMER_NOT_FOUND', `customer ${customerId} not found`, 404);
    }
    if (customer.disclaimerStaffSignedAt) {
      throw new AppError('DISCLAIMER_ALREADY_SIGNED', '服務人員已簽署，請進行顧客簽署步驟', 409);
    }

    const template = await this.prisma.disclaimerTemplate.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!template) throw new AppError('DISCLAIMER_TEMPLATE_NOT_FOUND', '找不到啟用中的免責聲明書範本', 404);

    // 若顧客還沒有編號且有身分證字號，在 PDF 產生前先算好，確保 PDF 內容包含正確的顧客編號
    const newCustomerCode =
      !customer.customerCode && customer.nationalId
        ? `${customer.store.code}-${customer.nationalId}`
        : undefined;
    const effectiveCustomerCode = newCustomerCode ?? customer.customerCode;

    const headerData: DisclaimerHeaderData = {
      customerName: customer.name,
      customerCode: effectiveCustomerCode,
      nationalId: customer.nationalId ?? '（未填）',
      phone: formatPhoneDisplay(customer.phone) ?? '（未填）',
      address: customer.address ?? '',
      storeName: customer.store.name,
      storeCode: customer.store.code,
    };
    const sections = template.sections as unknown as DisclaimerSection[];
    const { pdfBytes, anchors } = await buildDisclaimerPdf({ title: template.title, sections }, headerData);

    const signedAt = new Date();
    const signedPdfBytes = await applySignaturesToDisclaimerPdf(pdfBytes, anchors, [
      {
        role: 'staff',
        signaturePngBytes: decodeBase64Png(input.signatureImageUrl),
        dateLabel: formatDateLabel(signedAt),
      },
    ]);
    const disclaimerPath = await saveCustomerFile(customerId, DISCLAIMER_FILE_NAME, signedPdfBytes);

    const contentSnapshot = {
      templateVersion: template.version,
      title: template.title,
      sections,
      headerData,
      layoutVersion: CURRENT_LAYOUT_VERSION,
      signerRole: 'staff',
      signedAt: signedAt.toISOString(),
    };
    const contentHash = hashJson(contentSnapshot);
    const recordHash = buildRecordHash({
      customerId,
      documentType: 'disclaimer',
      signerRole: 'staff',
      contentHash,
      signatureImageUrl: input.signatureImageUrl,
      signedAt: signedAt.toISOString(),
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.signature.create({
        data: {
          customerId,
          documentType: 'disclaimer',
          signerRole: 'staff',
          signerUserId: actor.id,
          signatureImageUrl: input.signatureImageUrl,
          signaturePointsJson: input.signaturePoints as Prisma.InputJsonValue | undefined,
          contentSnapshot: contentSnapshot as unknown as Prisma.InputJsonValue,
          contentHash,
          recordHash,
          signedAt,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          deviceInfo: input.deviceInfo,
        },
      });
      await tx.customer.update({
        where: { id: customerId },
        data: {
          disclaimerStaffSignedAt: signedAt,
          disclaimerStaffId: actor.id,
          disclaimerPath,
          isExosomeUser: true,
          ...(newCustomerCode ? { customerCode: newCustomerCode } : {}),
        },
      });
    });

    return {
      hasDisclaimer: true,
      disclaimerCustomerSignedAt: null,
      disclaimerStaffSignedAt: signedAt.toISOString(),
      disclaimerFullySigned: false,
    };
  }

  async signDisclaimer(actor: AuthenticatedUser, customerId: number, input: SignDisclaimerInput): Promise<DisclaimerStatus> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: {
        id: true,
        disclaimerPath: true,
        disclaimerCustomerSignedAt: true,
        disclaimerStaffSignedAt: true,
        nationalId: true,
        customerCode: true,
        storeId: true,
        store: { select: { code: true } },
      },
    });
    if (!customer || !canActorAccessCustomer(actor, { storeId: customer.storeId })) {
      throw new AppError('CUSTOMER_NOT_FOUND', `customer ${customerId} not found or not visible to actor ${actor.id}`, 404);
    }
    if (!customer.disclaimerPath || !customer.disclaimerStaffSignedAt) {
      throw new AppError('DISCLAIMER_NOT_FOUND', 'staff has not signed the disclaimer yet', 404);
    }
    if (customer.disclaimerCustomerSignedAt) {
      throw new AppError('DISCLAIMER_ALREADY_SIGNED', 'customer already signed', 409);
    }

    // 用服務人員簽署當下凍結的 contentSnapshot 重建排版，保證跟磁碟上那份 PDF 的版面完全對齊
    // （不能用「現在的」顧客資料重算，姓名/地址等欄位之後被 PATCH 改過長度就會讓座標跟舊 PDF 對不齊）。
    const staffSignature = await this.prisma.signature.findFirst({
      where: { customerId, documentType: 'disclaimer', signerRole: 'staff' },
      orderBy: { signedAt: 'desc' },
    });
    if (!staffSignature) {
      throw new AppError('DISCLAIMER_NOT_FOUND', 'no staff signature record found', 404);
    }
    const frozen = staffSignature.contentSnapshot as unknown as FrozenDisclaimerSnapshot;

    const signedAt = new Date();
    const contentSnapshot = {
      templateVersion: frozen.templateVersion,
      title: frozen.title,
      sections: frozen.sections,
      headerData: frozen.headerData,
      layoutVersion: frozen.layoutVersion ?? 1,
      signerRole: 'customer',
      signedAt: signedAt.toISOString(),
    };

    assertSignaturePayloadValid({
      contentSnapshot,
      signatureImageUrl: input.signatureImageUrl,
      signaturePoints: input.signaturePoints,
    });

    // 用服務人員簽署當時的版面版本重算座標，才會和磁碟上那份 PDF 對齊
    const { anchors } = await buildDisclaimerPdf(
      { title: frozen.title, sections: frozen.sections },
      frozen.headerData,
      frozen.layoutVersion ?? 1,
    );
    const existingPdf = await loadCustomerFile(customerId, DISCLAIMER_FILE_NAME);
    const signedPdfBytes = await applySignaturesToDisclaimerPdf(existingPdf, anchors, [
      {
        role: 'customer',
        signaturePngBytes: decodeBase64Png(input.signatureImageUrl),
        dateLabel: formatDateLabel(signedAt),
      },
    ]);

    // 先確保新 PDF 真的寫成功，才讓 DB 記下「已簽署」（跟 id_document 流程一致的安全順序）。
    await saveCustomerFile(customerId, DISCLAIMER_FILE_NAME, signedPdfBytes);

    const contentHash = hashJson(contentSnapshot);
    const recordHash = buildRecordHash({
      customerId,
      documentType: 'disclaimer',
      signerRole: 'customer',
      contentHash,
      signatureImageUrl: input.signatureImageUrl,
      signedAt: signedAt.toISOString(),
    });

    await this.prisma.$transaction(async (tx) => {
      // 顧客不是登入帳號，這裡不設 signerUserId（跟 createCustomerWithSignature 原本記錄
      // 顧客簽名時的慣例一致）——actor 在這支只用來做權限檢查，不是真正的簽署人。
      await tx.signature.create({
        data: {
          customerId,
          documentType: 'disclaimer',
          signerRole: 'customer',
          signatureImageUrl: input.signatureImageUrl,
          signaturePointsJson: input.signaturePoints as Prisma.InputJsonValue | undefined,
          contentSnapshot: contentSnapshot as unknown as Prisma.InputJsonValue,
          contentHash,
          recordHash,
          signedAt,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          deviceInfo: input.deviceInfo,
        },
      });

      const newCustomerCode =
        !customer.customerCode && customer.nationalId
          ? `${customer.store.code}-${customer.nationalId}`
          : undefined;

      await tx.customer.update({
        where: { id: customerId },
        data: {
          disclaimerCustomerSignedAt: signedAt,
          ...(newCustomerCode ? { customerCode: newCustomerCode } : {}),
        },
      });
    });

    const updated = await this.prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
      select: { disclaimerCustomerSignedAt: true, disclaimerStaffSignedAt: true },
    });

    return {
      hasDisclaimer: true,
      disclaimerCustomerSignedAt: updated.disclaimerCustomerSignedAt?.toISOString() ?? null,
      disclaimerStaffSignedAt: updated.disclaimerStaffSignedAt?.toISOString() ?? null,
      disclaimerFullySigned: Boolean(updated.disclaimerCustomerSignedAt && updated.disclaimerStaffSignedAt),
    };
  }

  async getDisclaimerBuffer(actor: AuthenticatedUser, customerId: number): Promise<Buffer> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: { disclaimerPath: true, ...VISIBILITY_SELECT },
    });
    if (!customer || !canActorAccessCustomer(actor, { storeId: customer.storeId })) {
      throw new AppError('CUSTOMER_NOT_FOUND', `customer ${customerId} not found or not visible to actor ${actor.id}`, 404);
    }
    if (!customer.disclaimerPath) {
      throw new AppError('DISCLAIMER_NOT_FOUND', 'no disclaimer signed yet', 404);
    }
    return loadCustomerFile(customerId, DISCLAIMER_FILE_NAME);
  }
}
