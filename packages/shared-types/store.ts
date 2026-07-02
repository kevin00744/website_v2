import { z } from 'zod';
import { optionalAddressSchema, optionalNoteSchema, optionalPhoneSchema } from './customer';

/** 跟 index.ts 的 Region 同一個值域，這裡不重新 export，避免跟 index.ts 的型別宣告撞名 */
type RegionValue = 'north' | 'central' | 'south';

export const storeNameSchema = z
  .string()
  .trim()
  .min(1, '分店名稱不能空白')
  .max(50, '分店名稱好像太長了，請確認一下');

export const storeRegionSchema = z.enum(['north', 'central', 'south'], {
  errorMap: () => ({ message: '請選擇分店所屬區域' }),
});

/**
 * 新增分店表單用的 schema：故意不含 code，編號是後端依區域自動生成（N01/C01/S01...），
 * 前端完全不需要、也不該讓使用者自己輸入編號。
 */
export const createStoreSchema = z.object({
  name: storeNameSchema,
  region: storeRegionSchema,
  phone: optionalPhoneSchema,
  address: optionalAddressSchema,
  note: optionalNoteSchema,
});

export type CreateStoreInput = z.infer<typeof createStoreSchema>;

/** 對應後端 StoresService.toSummary() 回傳的形狀 */
export interface StoreSummary {
  id: number;
  code: string;
  name: string;
  region: RegionValue;
  regionSequence: number;
  phone: string | null;
  address: string | null;
  isActive: boolean;
}
