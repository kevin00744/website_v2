import { createHash } from 'crypto';
import { AppError } from '../common/errors/app-error';

export interface SignaturePoint {
  x: number;
  y: number;
}

/** 簽名軌跡至少要有這麼多筆觸座標，避免手滑點一下就送出空簽名 */
export const MIN_SIGNATURE_POINTS = 10;

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** 對 JSON 內容做穩定排序後再雜湊，避免 key 順序不同造成雜湊不一致 */
export function hashJson(value: unknown): string {
  const sorted = JSON.stringify(value, Object.keys(value as object).sort());
  return sha256(sorted);
}

export function buildRecordHash(params: {
  customerId: number;
  documentType: string;
  signerRole: string;
  contentHash: string;
  signatureImageUrl: string;
  signedAt: string;
}): string {
  const payload = [
    params.customerId,
    params.documentType,
    params.signerRole,
    params.contentHash,
    params.signatureImageUrl,
    params.signedAt,
  ].join('|');
  return sha256(payload);
}

/**
 * 共用驗證：SignatureService（單獨補簽）跟 CustomersService（建檔+簽署同一筆 transaction）
 * 都要套用同一套「不能是空簽名」規則，所以抽成獨立函式，不要兩邊各寫一份容易漏改。
 */
export function assertSignaturePayloadValid(params: {
  contentSnapshot: unknown;
  signatureImageUrl: string;
  signaturePoints?: SignaturePoint[];
}): void {
  if (!params.contentSnapshot || Object.keys(params.contentSnapshot as object).length === 0) {
    throw new AppError('SIGNATURE_CONTENT_MISSING', 'content snapshot is empty');
  }
  if (!params.signatureImageUrl) {
    throw new AppError('SIGNATURE_IMAGE_MISSING', 'signature image url is required');
  }
  if (params.signaturePoints && params.signaturePoints.length < MIN_SIGNATURE_POINTS) {
    throw new AppError('SIGNATURE_TOO_SMALL', 'signature stroke has too few points');
  }
}
