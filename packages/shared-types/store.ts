import { z } from 'zod';
import { optionalAddressSchema, optionalNoteSchema, optionalPhoneSchema } from './customer';

/** A=北部, B=中部, C=南部 */
type RegionValue = 'A' | 'B' | 'C';

export const storeNameSchema = z
  .string()
  .trim()
  .min(1, '分店名稱不能空白')
  .max(50, '分店名稱好像太長了，請確認一下');

export const storeRegionSchema = z.enum(['A', 'B', 'C'], {
  errorMap: () => ({ message: '請選擇分店所屬區域' }),
});

/**
 * 新增分店表單用的 schema：故意不含 code，編號是後端依區域自動生成（A01/B01/C01...），
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
  dealerId: number | null;
  dealerName: string | null;
}
