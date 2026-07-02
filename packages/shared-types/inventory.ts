import { z } from 'zod';

/** 跟 index.ts 不衝突的本地型別，沿用 store.ts 的命名慣例（不重新 export 同名型別） */
type InventoryMovementTypeValue = 'restock' | 'consumption' | 'adjustment' | 'transfer_in' | 'transfer_out';

export const INVENTORY_MOVEMENT_TYPE_LABEL: Record<InventoryMovementTypeValue, string> = {
  restock: '進貨',
  consumption: '消耗',
  adjustment: '盤點校正',
  transfer_in: '調入',
  transfer_out: '調出',
};

/** 顧客檔案的「商品使用紀錄」固定用 consumption，門市人員不需要、也不該自己選類型 */
export const consumeInventorySchema = z.object({
  productId: z.number({ invalid_type_error: '請選擇商品' }).int().positive('請選擇商品'),
  quantity: z
    .number({ invalid_type_error: '請輸入使用數量' })
    .int('數量必須是整數')
    .positive('數量必須大於 0'),
  reason: z.string().trim().max(200, '備註好像太長了，請確認一下').optional(),
});

export type ConsumeInventoryInput = z.infer<typeof consumeInventorySchema>;

/** 對應後端 InventoryService.adjust() 實際送出的 payload（多了固定欄位 storeId/type/customerId） */
export interface AdjustInventoryPayload {
  storeId: number;
  productId: number;
  type: InventoryMovementTypeValue;
  quantity: number;
  customerId?: number;
  reason?: string;
}

/** 對應後端 InventoryService.toSummary() 回傳的形狀 */
export interface StoreInventorySummary {
  id: number;
  storeId: number;
  productId: number;
  productName: string;
  productSku: string;
  quantity: number;
  updatedAt: string;
}

/** 對應後端 InventoryService.listByCustomer() 回傳的形狀，給顧客檔案的「商品使用紀錄」Tab 用 */
export interface InventoryLogSummary {
  id: number;
  type: InventoryMovementTypeValue;
  quantity: number;
  storeId: number;
  productId: number;
  productName: string;
  performedByName: string;
  reason: string | null;
  createdAt: string;
}

/** 對應後端 InventoryService.listProducts()，補貨請求選商品用的目錄 */
export interface ProductSummary {
  id: number;
  sku: string;
  name: string;
  unit: string | null;
}

/** 店長提出補貨請求的表單；storeId 選填——manager 不用帶（後端用自己所屬分店），admin 開放代填 */
export const createRestockRequestSchema = z.object({
  storeId: z.number().int().positive().optional(),
  productId: z.number({ invalid_type_error: '請選擇商品' }).int().positive('請選擇商品'),
  quantity: z
    .number({ invalid_type_error: '請輸入需要補貨的數量' })
    .int('數量必須是整數')
    .positive('數量必須大於 0'),
  note: z.string().trim().max(200, '備註好像太長了，請確認一下').optional(),
});
export type CreateRestockRequestInput = z.infer<typeof createRestockRequestSchema>;

/** 對應後端 InventoryService.listRestockRequests()/createRestockRequest()/completeRestockRequest() */
export interface RestockRequestSummary {
  id: number;
  storeId: number;
  storeName: string;
  productId: number;
  productName: string;
  quantity: number;
  note: string | null;
  requestedBy: number;
  requesterName: string;
  isCompleted: boolean;
  completedAt: string | null;
  completedByName: string | null;
  createdAt: string;
}
