import { z } from 'zod';

export const productSkuSchema = z
  .string()
  .trim()
  .min(1, '商品編號（SKU）不能空白')
  .max(40, '商品編號好像太長了，請確認一下');

export const productNameSchema = z.string().trim().min(1, '商品名稱不能空白').max(100, '名稱好像太長了，請確認一下');

export const createProductSchema = z.object({
  sku: productSkuSchema,
  name: productNameSchema,
  unit: z.string().trim().max(20, '單位好像太長了，請確認一下').optional().or(z.literal('')),
  description: z.string().trim().max(500, '說明好像太長了，請確認一下').optional().or(z.literal('')),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z.object({
  sku: productSkuSchema,
  name: productNameSchema,
  unit: z.string().trim().max(20, '單位好像太長了，請確認一下').optional().or(z.literal('')),
  description: z.string().trim().max(500, '說明好像太長了，請確認一下').optional().or(z.literal('')),
  isActive: z.boolean(),
});
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

/** 對應後端 ProductsService 的完整商品列表，給「商品管理」頁面用（跟 inventory.ts 裡精簡版的 ProductSummary 不同，這份含 description/isActive/updatedAt） */
export interface ProductAdminSummary {
  id: number;
  sku: string;
  name: string;
  unit: string | null;
  description: string | null;
  isActive: boolean;
  updatedAt: string;
}
