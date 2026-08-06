import { z } from 'zod';

/**
 * 必填欄位：姓名、身分證字號。
 * 選填欄位：電話、住址、LINE ID、Email、備註。
 * 這個分級是 Version 1（cms）既有規範，Version 2 維持一致。
 *
 * 錯誤訊息直接寫白話文，因為這是純前端表單驗證，不走後端 AppError -> 話術字典那條路徑
 * （那條路徑是給「伺服器執行後才知道的錯誤」用的，例如重複建檔；格式錯誤在使用者打字當下就能判斷）。
 */
export const customerNameSchema = z
  .string()
  .trim()
  .min(1, '姓名不能空白')
  .max(50, '姓名好像太長了，請確認一下');

/** 台灣身分證字號：1個大寫字母 + 9位數字，第2位（性別碼）只能是1或2 */
export const nationalIdSchema = z
  .string()
  .trim()
  .min(1, '身分證字號不能空白')
  .regex(/^[A-Za-z][12]\d{8}$/, '身分證字號格式不太對，請再檢查一次（例如 A123456789）')
  .transform((value) => value.toUpperCase());

/** 電話格式固定為「09XX-XXX-XXX」（台灣手機號碼，4-3-3 分組），選填但有填就要符合格式 */
export const optionalPhoneSchema = z
  .string()
  .trim()
  .optional()
  .refine((value) => !value || /^09\d{2}-\d{3}-\d{3}$/.test(value), {
    message: '電話號碼格式不對，要09開頭，例如 0912-345-678',
  });

export const optionalEmailSchema = z
  .string()
  .trim()
  .optional()
  .refine((value) => !value || z.string().email().safeParse(value).success, {
    message: 'Email 格式不太對，請再檢查一次',
  });

export const optionalAddressSchema = z.string().trim().max(200, '住址好像太長了，請確認一下').optional();
export const optionalLineSchema = z.string().trim().max(100, 'LINE ID 好像太長了，請確認一下').optional();
export const optionalNoteSchema = z.string().trim().max(500, '備註好像太長了，請確認一下').optional();

export const customerDuplicateSearchSchema = z.object({
  query: z.string().trim().min(2, '請至少輸入2個字或數字才能搜尋'),
});

/** 新增顧客 Step 2「填寫基本資料」用的完整 schema */
export const customerBasicInfoSchema = z.object({
  name: customerNameSchema,
  nationalId: nationalIdSchema,
  phone: optionalPhoneSchema,
  address: optionalAddressSchema,
  line: optionalLineSchema,
  email: optionalEmailSchema,
  note: optionalNoteSchema,
});

/**
 * storeId 永遠是「可選」欄位本身——manager 登入時介面完全不顯示分店選擇，
 * 帶不帶這個欄位都一樣（後端會強制用 manager 自己的 storeId，見 customers.service.ts 的
 * resolveCreateStore）；admin/system_admin 登入時則必須選店，但「必填」這件事是
 * NewCustomerWizard 用 .extend({ storeId: z.number(...) }) 動態加上去的，不是寫死在這裡，
 * 因為同一份 schema 要同時服務 manager（不需要）跟 admin（必填）兩種情境。
 */
export const customerBasicInfoWithOptionalStoreSchema = customerBasicInfoSchema.extend({
  storeId: z.number({ invalid_type_error: '請選擇分店' }).optional(),
});

export type CustomerBasicInfoWithOptionalStoreInput = z.infer<typeof customerBasicInfoWithOptionalStoreSchema>;

/**
 * 非外泌體顧客建立 schema：姓名 + 電話必填，身分證字號選填。
 * 不走免責聲明簽署流程——若日後勾選外泌體，可在顧客詳情頁補填。
 */
const requiredPhoneSchema = z
  .string()
  .trim()
  .min(1, '電話為必填欄位')
  .refine((v) => /^09\d{2}-\d{3}-\d{3}$/.test(v), { message: '電話號碼格式不對，要09開頭，例如 0912-345-678' });

export const customerBasicInfoNonExosomeSchema = z.object({
  name: customerNameSchema,
  nationalId: z.string().trim().optional().or(z.literal('')),
  phone: requiredPhoneSchema,
  address: optionalAddressSchema,
  line: optionalLineSchema,
  email: optionalEmailSchema,
  note: optionalNoteSchema,
});

export const customerBasicInfoNonExosomeWithOptionalStoreSchema = customerBasicInfoNonExosomeSchema.extend({
  storeId: z.number({ invalid_type_error: '請選擇分店' }).optional(),
});

export const customerBasicInfoNonExosomeRequireStoreSchema = customerBasicInfoNonExosomeWithOptionalStoreSchema.extend({
  storeId: z.number({ invalid_type_error: '請選擇分店' }),
});

export type CustomerBasicInfoNonExosomeInput = z.infer<typeof customerBasicInfoNonExosomeWithOptionalStoreSchema>;

/** admin/system_admin 登入時，「分店選擇」變成必填——見上方 customerBasicInfoWithOptionalStoreSchema 的說明 */
export const customerBasicInfoRequireStoreSchema = customerBasicInfoWithOptionalStoreSchema.extend({
  storeId: z.number({ invalid_type_error: '請選擇分店' }),
});

/**
 * 編輯顧客用的 schema：故意用 .omit 把 name/nationalId 拿掉，
 * 這兩個欄位終身鎖定不可修改，編輯表單從型別上就不該出現可編輯的 input 綁定到它們。
 */
export const customerUpdateSchema = customerBasicInfoSchema
  .omit({ name: true, nationalId: true })
  .extend({ isExosomeUser: z.boolean().optional() });

export const signaturePointSchema = z.object({ x: z.number(), y: z.number() });

/**
 * 注意：故意不含 contentSnapshot——那是後端自己在 CustomersService.createCustomerWithSignature
 * 裡用「當下真正生效的 DisclaimerTemplate」重新組裝凍結進去的，不能信任前端傳來的內容當作正式存證
 * （前端的 SignatureCanvasStep 抓 template 純粹是為了顯示給顧客閱讀）。
 */
export const customerSignaturePayloadSchema = z.object({
  signatureImageUrl: z.string().min(1, '請完成簽名'),
  signaturePoints: z.array(signaturePointSchema).optional(),
});

/** POST /customers/with-signature 的請求 body（顧客資料 + 簽名打包成同一個 payload） */
export const customerWithSignatureSchema = customerBasicInfoWithOptionalStoreSchema.extend({
  signature: customerSignaturePayloadSchema,
  isExosomeUser: z.boolean().optional(),
});

export type CustomerDuplicateSearchInput = z.infer<typeof customerDuplicateSearchSchema>;
export type CustomerBasicInfoInput = z.infer<typeof customerBasicInfoSchema>;
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;
export type CustomerSignaturePayloadInput = z.infer<typeof customerSignaturePayloadSchema>;
export type CustomerWithSignatureInput = z.infer<typeof customerWithSignatureSchema>;

/**
 * 外部列表（CustomerTable/CustomerCardList）欄位：基本識別資訊 + 歸屬資訊
 * （區域/分店/顧客編號/建立日期），歸屬資訊是給能看多家店的 admin/system_admin/dealer 用的。
 */
export interface CustomerListItem {
  id: number;
  name: string;
  phone: string | null;
  nationalId: string | null;
  customerCode: string | null;
  storeId: number;
  storeName: string;
  region: 'A' | 'B' | 'C';
  dealerName: string | null;
  createdAt: string;
}

/** 點開單一顧客才展開的完整內容，對應 Detail Drawer */
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

/** 切換 requiresSignature 就是「設定簽名位置」的唯一機制，座標由後端排版引擎自動算出 */
export interface DisclaimerSection {
  heading: string;
  paragraphs: string[];
  requiresSignature: boolean;
}

export interface DisclaimerTemplate {
  version: string;
  title: string;
  sections: DisclaimerSection[];
}

export type DocumentSignerRole = 'customer' | 'staff';

export interface DocumentStatus {
  hasDocument: boolean;
  documentCustomerSignedAt: string | null;
  documentStaffSignedAt: string | null;
  documentFullySigned: boolean;
}

export interface DisclaimerStatus {
  hasDisclaimer: boolean;
  disclaimerCustomerSignedAt: string | null;
  disclaimerStaffSignedAt: string | null;
  disclaimerFullySigned: boolean;
}

export interface TreatmentProductSummary {
  id: number;
  sku: string;
  name: string;
  unit: string | null;
}

export interface TreatmentRecord {
  id: number;
  customerId: number;
  product: TreatmentProductSummary;
  performedBy: { id: number; name: string };
  performedAt: string;
  note: string | null;
  photos: string[];
  createdAt: string;
}
