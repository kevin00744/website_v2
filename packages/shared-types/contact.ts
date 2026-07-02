import { z } from 'zod';

export type RegionValue = 'north' | 'central' | 'south';

/**
 * 台灣縣市 → 北/中/南三分區，跟 Store.region／User.region 是同一套三分區（沿用既有的
 * 經銷商轄區劃分），不是另外發明一套地理分類。訪客在「聯絡我們」表單選的是實際縣市，
 * 後端送出時會用這份對照表換算成 region，分派給對應區域的經銷商。
 */
export const TAIWAN_CITY_REGION: Record<string, RegionValue> = {
  台北市: 'north',
  新北市: 'north',
  桃園市: 'north',
  新竹市: 'north',
  新竹縣: 'north',
  基隆市: 'north',
  宜蘭縣: 'north',
  台中市: 'central',
  苗栗縣: 'central',
  彰化縣: 'central',
  南投縣: 'central',
  雲林縣: 'central',
  嘉義市: 'south',
  嘉義縣: 'south',
  台南市: 'south',
  高雄市: 'south',
  屏東縣: 'south',
  澎湖縣: 'south',
  台東縣: 'south',
  花蓮縣: 'south',
  金門縣: 'south',
  連江縣: 'south',
};

/** 表單下拉選單顯示順序：北到南，跟 TAIWAN_CITY_REGION 的 key 集合保證一致（下面有 dev-time 驗證可參考） */
export const TAIWAN_CITIES = Object.keys(TAIWAN_CITY_REGION);

export function regionForCity(city: string): RegionValue | undefined {
  return TAIWAN_CITY_REGION[city];
}

export type InquiryCategoryKindValue = 'franchise' | 'experience' | 'other';

export const INQUIRY_CATEGORY_KIND_LABEL: Record<InquiryCategoryKindValue, string> = {
  franchise: '加盟諮詢（自動讓所在地區的經銷商看到）',
  experience: '體驗諮詢（經銷商可轉給特定分店）',
  other: '其他（只有管理員看得到，不會自動分派）',
};

/** 前台「聯絡我們」公開表單用 */
export const contactMessageSchema = z.object({
  name: z.string().trim().min(1, '請輸入姓名').max(50, '姓名好像太長了，請確認一下'),
  phone: z.string().trim().max(20, '電話好像太長了，請確認一下').optional().or(z.literal('')),
  email: z.string().trim().email('Email 格式不正確').optional().or(z.literal('')),
  city: z.string().trim().min(1, '請選擇所在地區'),
  categoryId: z.coerce.number({ invalid_type_error: '請選擇詢問類別' }).int().positive('請選擇詢問類別'),
  message: z.string().trim().max(1000, '內容好像太長了，請確認一下').optional().or(z.literal('')),
});
export type ContactMessageInput = z.infer<typeof contactMessageSchema>;

/** 對應後端 ContactService.listPublicCategories()，表單下拉選單用 */
export interface ContactCategoryOption {
  id: number;
  name: string;
}

/** 後台「詢問類別管理」用的表單 */
export const inquiryCategorySchema = z.object({
  name: z.string().trim().min(1, '類別名稱不能空白').max(50, '名稱好像太長了，請確認一下'),
  kind: z.enum(['franchise', 'experience', 'other']),
  isActive: z.boolean(),
});
export type InquiryCategoryInput = z.infer<typeof inquiryCategorySchema>;

/** 對應後端 ContactService 的 InquiryCategory CRUD */
export interface InquiryCategorySummary {
  id: number;
  name: string;
  kind: InquiryCategoryKindValue;
  isActive: boolean;
  sortOrder: number;
  updatedAt: string;
}

/** 對應後端 ContactService.listMessages()，後台「聯絡訊息」清單用 */
export interface ContactMessageSummary {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  city: string;
  region: RegionValue;
  message: string | null;
  categoryId: number;
  categoryName: string;
  categoryKind: InquiryCategoryKindValue;
  storeId: number | null;
  storeName: string | null;
  forwardedAt: string | null;
  forwardedByName: string | null;
  isHandled: boolean;
  createdAt: string;
}
