import { Injectable } from '@nestjs/common';
import { Prisma, SignerRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { assertSignaturePayloadValid, buildRecordHash, hashJson, type SignaturePoint } from '../signature/signature-hash.util';
import { canActorAccessCustomer } from '../auth/role-access.util';
import type { AuthenticatedUser } from '../auth/types';
import {
  applySignatureToPdf,
  buildDocumentPdf,
  CUSTOMER_SIGNATURE_BOX,
  decodeBase64Png,
  STAFF_SIGNATURE_BOX,
} from './document-pdf.util';
import { loadCustomerFile, saveCustomerFile } from './customer-file-storage.util';

const DOCUMENT_FILE_NAME = 'document.pdf';

const VISIBILITY_SELECT = { storeId: true } as const;

interface SignDocumentInput {
  signerRole: SignerRole;
  signatureImageUrl: string;
  signaturePoints?: SignaturePoint[];
  ipAddress?: string;
  userAgent?: string;
  deviceInfo?: string;
}

export interface DocumentStatus {
  hasDocument: boolean;
  documentCustomerSignedAt: string | null;
  documentStaffSignedAt: string | null;
  documentFullySigned: boolean;
}

@Injectable()
export class CustomerDocumentService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 上傳文件照片 → 合成一份新 PDF（每張照片各佔一頁，page 1 保留雙簽名框）。
   * 重新上傳等於整份文件重來一次，會把舊的簽署狀態清空——
   * 否則會出現「PDF 內容換了，但簽署紀錄還留著」這種對不起來的狀態。
   * 文件一旦雙方簽完就鎖定，不能再重新上傳覆蓋掉已經簽過的證據。
   */
  async uploadPhotos(actor: AuthenticatedUser, customerId: number, photos: Buffer[]) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: { id: true, documentCustomerSignedAt: true, documentStaffSignedAt: true, ...VISIBILITY_SELECT },
    });
    if (!customer || !canActorAccessCustomer(actor, { storeId: customer.storeId })) {
      throw new AppError('CUSTOMER_NOT_FOUND', `customer ${customerId} not found or not visible to actor ${actor.id}`, 404);
    }
    if (customer.documentCustomerSignedAt && customer.documentStaffSignedAt) {
      throw new AppError('DOCUMENT_LOCKED', 'document already fully signed', 409);
    }

    const pdfBytes = await buildDocumentPdf(photos);
    const documentPath = await saveCustomerFile(customerId, DOCUMENT_FILE_NAME, pdfBytes);

    await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        documentPath,
        documentCustomerSignedAt: null,
        documentStaffSignedAt: null,
        documentStaffId: null,
      },
    });

    return { documentPath };
  }

  async signDocument(actor: AuthenticatedUser, customerId: number, input: SignDocumentInput): Promise<DocumentStatus> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: {
        id: true,
        documentPath: true,
        documentCustomerSignedAt: true,
        documentStaffSignedAt: true,
        ...VISIBILITY_SELECT,
      },
    });
    if (!customer || !canActorAccessCustomer(actor, { storeId: customer.storeId })) {
      throw new AppError('CUSTOMER_NOT_FOUND', `customer ${customerId} not found or not visible to actor ${actor.id}`, 404);
    }
    if (!customer.documentPath) {
      throw new AppError('DOCUMENT_NOT_FOUND', 'no document uploaded yet', 404);
    }
    if (customer.documentCustomerSignedAt && customer.documentStaffSignedAt) {
      throw new AppError('DOCUMENT_LOCKED', 'document already fully signed', 409);
    }
    if (input.signerRole === 'customer' && customer.documentCustomerSignedAt) {
      throw new AppError('DOCUMENT_ALREADY_SIGNED', 'customer already signed', 409);
    }
    if (input.signerRole === 'staff' && customer.documentStaffSignedAt) {
      throw new AppError('DOCUMENT_ALREADY_SIGNED', 'staff already signed', 409);
    }

    const signedAt = new Date();
    const contentSnapshot = {
      documentPath: customer.documentPath,
      signerRole: input.signerRole,
      signedAt: signedAt.toISOString(),
    };
    assertSignaturePayloadValid({
      contentSnapshot,
      signatureImageUrl: input.signatureImageUrl,
      signaturePoints: input.signaturePoints,
    });

    const existingPdf = await loadCustomerFile(customerId, DOCUMENT_FILE_NAME);
    const box = input.signerRole === 'customer' ? CUSTOMER_SIGNATURE_BOX : STAFF_SIGNATURE_BOX;
    const signedPdfBytes = await applySignatureToPdf(existingPdf, box, decodeBase64Png(input.signatureImageUrl));

    // 先確保「新的 PDF 真的寫成功」，才讓 DB 記下「已簽署」——
    // 避免 DB 說簽完了，但磁碟上的檔案其實沒被改到的不一致狀態。
    await saveCustomerFile(customerId, DOCUMENT_FILE_NAME, signedPdfBytes);

    const contentHash = hashJson(contentSnapshot);
    const recordHash = buildRecordHash({
      customerId,
      documentType: 'id_document',
      signerRole: input.signerRole,
      contentHash,
      signatureImageUrl: input.signatureImageUrl,
      signedAt: signedAt.toISOString(),
    });

    // 服務人員身分一律從登入後的 JWT 取得，不接受前端自己宣稱「我是哪個 userId」
    const signerUserId = input.signerRole === 'staff' ? actor.id : undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.signature.create({
        data: {
          customerId,
          documentType: 'id_document',
          signerRole: input.signerRole,
          signerUserId,
          signatureImageUrl: input.signatureImageUrl,
          signaturePointsJson: input.signaturePoints as Prisma.InputJsonValue | undefined,
          contentSnapshot,
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
        data:
          input.signerRole === 'customer'
            ? { documentCustomerSignedAt: signedAt }
            : { documentStaffSignedAt: signedAt, documentStaffId: signerUserId },
      });
    });

    const updated = await this.prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
      select: { documentCustomerSignedAt: true, documentStaffSignedAt: true },
    });

    return {
      hasDocument: true,
      documentCustomerSignedAt: updated.documentCustomerSignedAt?.toISOString() ?? null,
      documentStaffSignedAt: updated.documentStaffSignedAt?.toISOString() ?? null,
      documentFullySigned: Boolean(updated.documentCustomerSignedAt && updated.documentStaffSignedAt),
    };
  }

  async getDocumentBuffer(actor: AuthenticatedUser, customerId: number): Promise<Buffer> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: { documentPath: true, ...VISIBILITY_SELECT },
    });
    if (!customer || !canActorAccessCustomer(actor, { storeId: customer.storeId })) {
      throw new AppError('CUSTOMER_NOT_FOUND', `customer ${customerId} not found or not visible to actor ${actor.id}`, 404);
    }
    if (!customer.documentPath) {
      throw new AppError('DOCUMENT_NOT_FOUND', 'no document uploaded yet', 404);
    }
    return loadCustomerFile(customerId, DOCUMENT_FILE_NAME);
  }
}
