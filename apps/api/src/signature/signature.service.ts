import { Injectable } from '@nestjs/common';
import { DocumentType, Prisma, SignerRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { assertSignaturePayloadValid, buildRecordHash, hashJson, type SignaturePoint } from './signature-hash.util';

interface CreateSignatureInput {
  customerId: number;
  documentType: DocumentType;
  signerRole: SignerRole;
  signerUserId?: number;
  signatureImageUrl: string;
  signaturePoints?: SignaturePoint[];
  contentSnapshot: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  deviceInfo?: string;
}

@Injectable()
export class SignatureService {
  constructor(private readonly prisma: PrismaService) {}

  async createSignature(input: CreateSignatureInput) {
    assertSignaturePayloadValid(input);

    const signedAt = new Date();
    const contentHash = hashJson(input.contentSnapshot);
    const recordHash = buildRecordHash({
      customerId: input.customerId,
      documentType: input.documentType,
      signerRole: input.signerRole,
      contentHash,
      signatureImageUrl: input.signatureImageUrl,
      signedAt: signedAt.toISOString(),
    });

    const signature = await this.prisma.signature.create({
      data: {
        customerId: input.customerId,
        documentType: input.documentType,
        signerRole: input.signerRole,
        signerUserId: input.signerUserId,
        signatureImageUrl: input.signatureImageUrl,
        signaturePointsJson: input.signaturePoints as Prisma.InputJsonValue | undefined,
        contentSnapshot: input.contentSnapshot as Prisma.InputJsonValue,
        contentHash,
        recordHash,
        signedAt,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        deviceInfo: input.deviceInfo,
      },
    });

    // 同步快取欄位到 customers 表（不影響 signatures 表本身的 append-only 特性）
    if (input.documentType === 'disclaimer') {
      await this.prisma.customer.update({
        where: { id: input.customerId },
        data:
          input.signerRole === 'customer'
            ? { disclaimerCustomerSignedAt: signedAt }
            : { disclaimerStaffSignedAt: signedAt, disclaimerStaffId: input.signerUserId },
      });
    }

    return signature;
  }

  async verifySignature(signatureId: number): Promise<{ valid: boolean; signature: unknown }> {
    const signature = await this.prisma.signature.findUnique({ where: { id: signatureId } });
    if (!signature) {
      throw new AppError('SIGNATURE_NOT_FOUND', `signature ${signatureId} not found`, 404);
    }

    const recomputedContentHash = hashJson(signature.contentSnapshot);
    if (recomputedContentHash !== signature.contentHash) {
      throw new AppError('SIGNATURE_VERIFY_FAILED', 'content snapshot hash mismatch');
    }

    const recomputedRecordHash = buildRecordHash({
      customerId: signature.customerId,
      documentType: signature.documentType,
      signerRole: signature.signerRole,
      contentHash: signature.contentHash,
      signatureImageUrl: signature.signatureImageUrl,
      signedAt: signature.signedAt.toISOString(),
    });

    if (recomputedRecordHash !== signature.recordHash) {
      throw new AppError('SIGNATURE_VERIFY_FAILED', 'record hash mismatch — possible tampering');
    }

    return { valid: true, signature };
  }
}
