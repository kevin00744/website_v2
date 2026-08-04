import type {
  CustomerDetail,
  CustomerListItem,
  CustomerUpdateInput,
  CustomerWithSignatureInput,
  DisclaimerStatus,
  DisclaimerTemplate,
  DocumentSignerRole,
  DocumentStatus,
  TreatmentRecord,
} from '@website-v2/shared-types';
import { apiRequest } from './api-client';

export function createQuickCustomer(input: {
  name: string;
  phone: string;
  nationalId?: string;
  address?: string;
  line?: string;
  email?: string;
  note?: string;
  storeId?: number;
}): Promise<CustomerDetail> {
  return apiRequest<CustomerDetail>('/customers/quick', { method: 'POST', json: input });
}

export function searchCustomers(query: string): Promise<CustomerListItem[]> {
  const params = new URLSearchParams();
  if (query) params.set('search', query);
  return apiRequest<CustomerListItem[]>(`/customers?${params.toString()}`);
}

export function getCustomerDetail(id: number): Promise<CustomerDetail> {
  return apiRequest<CustomerDetail>(`/customers/${id}`);
}

/**
 * 建檔與簽署是不可分割的單一交易（Version 1 的硬規定：沒簽完同意書，建檔就算失敗），
 * 所以這裡故意只有這一支「連同簽名一起送」的建立 API，沒有單獨的「只建顧客」端點。
 */
export function createCustomerWithSignature(input: CustomerWithSignatureInput): Promise<CustomerDetail> {
  return apiRequest<CustomerDetail>('/customers/with-signature', { method: 'POST', json: input });
}

/** name/nationalId 終身鎖定，CustomerUpdateInput 型別本身就不包含這兩個欄位 */
/** 補填身分證字號（僅允許從 null 設定，不允許修改已有值） */
export function fillNationalId(id: number, nationalId: string): Promise<CustomerDetail> {
  return apiRequest<CustomerDetail>(`/customers/${id}`, { method: 'PATCH', json: { nationalId } });
}

export function updateCustomer(id: number, input: CustomerUpdateInput): Promise<CustomerDetail> {
  return apiRequest<CustomerDetail>(`/customers/${id}`, { method: 'PATCH', json: input });
}

/** 軟刪除（後端設 deletedAt），只有 admin/system_admin 能呼叫 */
export function deleteCustomer(id: number): Promise<void> {
  return apiRequest<void>(`/customers/${id}`, { method: 'DELETE' });
}

export function getDisclaimerTemplate(): Promise<DisclaimerTemplate> {
  return apiRequest<DisclaimerTemplate>('/content/disclaimer-template');
}

/** 沿用 Version 1 的玩法：多張照片合成一份 PDF，page 1 留兩個簽名框（顧客/服務人員） */
export function uploadCustomerDocument(customerId: number, photos: File[]): Promise<{ documentPath: string }> {
  const formData = new FormData();
  photos.forEach((photo) => formData.append('photos', photo));
  return apiRequest<{ documentPath: string }>(`/customers/${customerId}/document`, {
    method: 'POST',
    formData,
  });
}

export function signCustomerDocument(
  customerId: number,
  input: {
    signerRole: DocumentSignerRole;
    signatureImageUrl: string;
    signaturePoints?: { x: number; y: number }[];
  },
): Promise<DocumentStatus> {
  return apiRequest<DocumentStatus>(`/customers/${customerId}/document/sign`, { method: 'POST', json: input });
}

/** 相對路徑，給 apiRequestBlob/openPdfInNewTab 用（會自動帶 Authorization header，不能用裸 URL 直接開新分頁） */
export function getDocumentPdfPath(customerId: number): string {
  return `/customers/${customerId}/document`;
}

/** 服務人員事後補簽免責聲明書（非外泌體顧客改為使用外泌體時） */
export function signStaffDisclaimer(
  customerId: number,
  input: { signatureImageUrl: string; signaturePoints?: { x: number; y: number }[] },
): Promise<DisclaimerStatus> {
  return apiRequest<DisclaimerStatus>(`/customers/${customerId}/disclaimer/sign-staff`, { method: 'POST', json: input });
}

/** 顧客補簽免責聲明書 */
export function signDisclaimer(
  customerId: number,
  input: { signatureImageUrl: string; signaturePoints?: { x: number; y: number }[] },
): Promise<DisclaimerStatus> {
  return apiRequest<DisclaimerStatus>(`/customers/${customerId}/disclaimer/sign`, { method: 'POST', json: input });
}

/** 相對路徑，給 apiRequestBlob/openPdfInNewTab 用（會自動帶 Authorization header，不能用裸 URL 直接開新分頁） */
export function getDisclaimerPdfPath(customerId: number): string {
  return `/customers/${customerId}/disclaimer`;
}

// ─── 顧客持有課程（POS 扣堂選擇器用）───────────────────────────────────────

export interface CustomerCourseItem {
  id: number;
  serviceItem: { id: number; name: string; price: number };
  totalSessions: number;
  usedSessions: number;
  remainingSessions: number;
  createdAt: string;
}

export function listCustomerCourses(customerId: number): Promise<CustomerCourseItem[]> {
  return apiRequest<CustomerCourseItem[]>(`/customers/${customerId}/courses`);
}

export interface CustomerWalletInfo {
  balance: number;
  bonusBalance: number;
  total: number;
}

export function getCustomerWallet(customerId: number): Promise<CustomerWalletInfo> {
  return apiRequest<CustomerWalletInfo>(`/customers/${customerId}/wallet`);
}

export function topUpCustomerWallet(
  customerId: number,
  amount: number,
  paymentMethod: string,
  note?: string,
): Promise<{ balance: number; bonusBalance: number }> {
  return apiRequest(`/customers/${customerId}/wallet/top-up`, {
    method: 'POST',
    json: { amount, paymentMethod, note },
  });
}

// ─── 療程紀錄 ───────────────────────────────────────────────────────────────

export function listTreatmentRecords(customerId: number): Promise<TreatmentRecord[]> {
  return apiRequest<TreatmentRecord[]>(`/customers/${customerId}/treatments`);
}

export function createTreatmentRecord(
  customerId: number,
  input: { productId: number; note?: string; performedAt?: string },
): Promise<TreatmentRecord> {
  return apiRequest<TreatmentRecord>(`/customers/${customerId}/treatments`, { method: 'POST', json: input });
}

export function uploadTreatmentPhotos(customerId: number, recordId: number, files: File[]): Promise<TreatmentRecord> {
  const form = new FormData();
  files.forEach((f) => form.append('photos', f));
  return apiRequest<TreatmentRecord>(`/customers/${customerId}/treatments/${recordId}/photos`, {
    method: 'POST',
    formData: form,
  });
}

export function deleteTreatmentRecord(customerId: number, recordId: number): Promise<void> {
  return apiRequest<void>(`/customers/${customerId}/treatments/${recordId}`, { method: 'DELETE' });
}
