import { Injectable } from '@nestjs/common';
import type { InventoryMovementType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { canActorAccessCustomer, isAdminRole } from '../auth/role-access.util';
import type { AuthenticatedUser } from '../auth/types';

export interface InventoryLogSummary {
  id: number;
  type: InventoryMovementType;
  quantity: number;
  storeId: number;
  productId: number;
  productName: string;
  performedByName: string;
  reason: string | null;
  createdAt: string;
}

/** 哪些 type 是「進貨方向」（增加庫存），其餘（consumption/transfer_out）是「消耗方向」（減少庫存） */
const INCREASING_TYPES: InventoryMovementType[] = ['restock', 'transfer_in'];
const VALID_TYPES: InventoryMovementType[] = ['restock', 'consumption', 'adjustment', 'transfer_in', 'transfer_out'];

export interface AdjustInventoryInput {
  storeId: number;
  productId: number;
  type: InventoryMovementType;
  /**
   * restock/consumption/transfer_in/transfer_out 一律傳正整數，方向由 type 決定；
   * adjustment（盤點校正）方向不固定，這裡直接傳「校正後要增減的量」（可正可負），
   * 寫入 InventoryLog.quantity 時一律存絕對值，方向只看 type，跟 schema 設計的約定一致。
   */
  quantity: number;
  /** 店長在顧客身上消耗庫存時帶這個顧客 id；進貨/調撥等不涉及顧客的異動則不帶 */
  customerId?: number;
  reason?: string;
}

export interface StoreInventorySummary {
  id: number;
  storeId: number;
  productId: number;
  productName: string;
  productSku: string;
  quantity: number;
  updatedAt: string;
}

export interface ProductSummary {
  id: number;
  sku: string;
  name: string;
  unit: string | null;
}

export interface CreateRestockRequestInput {
  storeId?: number;
  productId: number;
  quantity: number;
  note?: string;
}

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

const RESTOCK_REQUEST_SELECT = {
  id: true,
  storeId: true,
  store: { select: { name: true, region: true } },
  productId: true,
  product: { select: { name: true } },
  quantity: true,
  note: true,
  requestedBy: true,
  requester: { select: { name: true } },
  isCompleted: true,
  completedAt: true,
  completer: { select: { name: true } },
  createdAt: true,
} as const;

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 管理員可操作任何分店的庫存；店長只能操作自己所屬分店——這裡是寫入層的資料隔離，
   * 跟 controller 上的 @Roles('manager')（admin 透過 isAdminRole 超集放行）是雙重防護。
   */
  private assertCanOperateStore(actor: AuthenticatedUser, storeId: number): void {
    if (isAdminRole(actor.role)) return;
    if (actor.role === 'manager' && actor.storeId === storeId) return;
    throw new AppError('INVENTORY_STORE_UNAUTHORIZED', `actor ${actor.id} cannot operate store ${storeId}`, 403);
  }

  private resolveDelta(type: InventoryMovementType, quantity: number): number {
    if (type === 'adjustment') {
      if (quantity === 0) {
        throw new AppError('INVENTORY_INVALID_QUANTITY', 'adjustment quantity cannot be zero', 400);
      }
      return quantity;
    }
    if (quantity <= 0) {
      throw new AppError('INVENTORY_INVALID_QUANTITY', `${type} quantity must be a positive integer`, 400);
    }
    return INCREASING_TYPES.includes(type) ? quantity : -quantity;
  }

  /**
   * 同一個 transaction 內：①檢查/更新 StoreInventory 的「目前數量」快取列、
   * ②寫入一筆 InventoryLog 帳本紀錄。兩者必須同進同出，避免「庫存改了但沒留紀錄」
   * 或「留了紀錄但快取數字沒跟上」這種不一致狀態。
   */
  async adjust(actor: AuthenticatedUser, input: AdjustInventoryInput) {
    if (!VALID_TYPES.includes(input.type)) {
      throw new AppError('INVENTORY_TYPE_INVALID', `unknown inventory movement type: ${input.type}`, 400);
    }
    if (!Number.isInteger(input.quantity)) {
      throw new AppError('INVENTORY_INVALID_QUANTITY', 'quantity must be an integer', 400);
    }

    this.assertCanOperateStore(actor, input.storeId);

    const delta = this.resolveDelta(input.type, input.quantity);

    return this.prisma.$transaction(async (tx) => {
      const store = await tx.store.findFirst({ where: { id: input.storeId, deletedAt: null } });
      if (!store) {
        throw new AppError('STORE_NOT_FOUND', 'selected store does not exist', 404);
      }
      const product = await tx.product.findFirst({ where: { id: input.productId, deletedAt: null } });
      if (!product) {
        throw new AppError('INVENTORY_PRODUCT_NOT_FOUND', 'selected product does not exist', 404);
      }

      if (input.customerId) {
        const customer = await tx.customer.findFirst({ where: { id: input.customerId, deletedAt: null } });
        if (!customer) {
          throw new AppError('CUSTOMER_NOT_FOUND', 'linked customer does not exist', 404);
        }
      }

      const existing = await tx.storeInventory.findUnique({
        where: { storeId_productId: { storeId: input.storeId, productId: input.productId } },
      });
      const currentQuantity = existing?.quantity ?? 0;
      const nextQuantity = currentQuantity + delta;
      if (nextQuantity < 0) {
        throw new AppError(
          'INVENTORY_INSUFFICIENT_STOCK',
          `store ${input.storeId} product ${input.productId} would go negative (${currentQuantity} + ${delta})`,
          400,
        );
      }

      const storeInventory = await tx.storeInventory.upsert({
        where: { storeId_productId: { storeId: input.storeId, productId: input.productId } },
        update: { quantity: nextQuantity },
        create: { storeId: input.storeId, productId: input.productId, quantity: nextQuantity },
      });

      const log = await tx.inventoryLog.create({
        data: {
          type: input.type,
          quantity: Math.abs(delta),
          storeId: input.storeId,
          productId: input.productId,
          performedBy: actor.id,
          customerId: input.customerId ?? null,
          reason: input.reason,
        },
      });

      return {
        storeInventory: toSummary(storeInventory, product),
        log: {
          id: log.id,
          type: log.type,
          quantity: log.quantity,
          storeId: log.storeId,
          productId: log.productId,
          performedBy: log.performedBy,
          customerId: log.customerId,
          reason: log.reason,
          createdAt: log.createdAt.toISOString(),
        },
      };
    });
  }

  /**
   * 查詢某分店目前的庫存快照。admin/system_admin 可查任何分店；
   * manager 只能查自己所屬分店——沒有帶 storeId 時 manager 預設查自己的店。
   */
  async listByStore(actor: AuthenticatedUser, requestedStoreId?: number): Promise<StoreInventorySummary[]> {
    const storeId = requestedStoreId ?? actor.storeId ?? undefined;
    if (!storeId) {
      throw new AppError('STORE_REQUIRED', 'storeId is required', 400);
    }
    this.assertCanOperateStore(actor, storeId);

    const rows = await this.prisma.storeInventory.findMany({
      where: { storeId },
      include: { product: true },
      orderBy: { product: { name: 'asc' } },
    });
    return rows.map((row) => toSummary(row, row.product));
  }

  /**
   * 顧客檔案的「商品使用紀錄」分頁：複用 canActorAccessCustomer，跟顧客詳細頁本身的
   * 資料隔離規則完全一致（manager 限自己分店顧客、dealer 限自己區域），不是另一套規則。
   */
  async listByCustomer(actor: AuthenticatedUser, customerId: number): Promise<InventoryLogSummary[]> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: { storeId: true, store: { select: { region: true } } },
    });
    if (!customer) {
      throw new AppError('CUSTOMER_NOT_FOUND', `customer ${customerId} not found`, 404);
    }
    if (!canActorAccessCustomer(actor, { storeId: customer.storeId, storeRegion: customer.store.region })) {
      throw new AppError('CUSTOMER_NOT_FOUND', `customer ${customerId} not visible to actor ${actor.id}`, 404);
    }

    const logs = await this.prisma.inventoryLog.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: { product: { select: { name: true } }, performer: { select: { name: true } } },
    });

    return logs.map((log) => ({
      id: log.id,
      type: log.type,
      quantity: log.quantity,
      storeId: log.storeId,
      productId: log.productId,
      productName: log.product.name,
      performedByName: log.performer.name,
      reason: log.reason,
      createdAt: log.createdAt.toISOString(),
    }));
  }

  /** 商品目錄：補貨請求要選「要補哪個商品」，不限店別/角色，只要是登入的店務相關角色都能查 */
  async listProducts(): Promise<ProductSummary[]> {
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
    });
    return products.map((product) => ({ id: product.id, sku: product.sku, name: product.name, unit: product.unit }));
  }

  /**
   * 店長提出補貨請求：跟 InventoryLog 的 restock 異動是兩件事——這張表只是「我需要補貨」的
   * 待辦通知，不會直接動 StoreInventory 的數字。貨真的到了之後，店長還是要另外用
   * adjust()（type: restock）記一筆真正的庫存異動，這支只負責建立「請經銷商注意」的請求。
   */
  async createRestockRequest(actor: AuthenticatedUser, input: CreateRestockRequestInput): Promise<RestockRequestSummary> {
    const storeId = input.storeId ?? actor.storeId ?? undefined;
    if (!storeId) {
      throw new AppError('STORE_REQUIRED', 'storeId is required', 400);
    }
    this.assertCanOperateStore(actor, storeId);

    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new AppError('INVENTORY_INVALID_QUANTITY', 'quantity must be a positive integer', 400);
    }

    const store = await this.prisma.store.findFirst({ where: { id: storeId, deletedAt: null } });
    if (!store) {
      throw new AppError('STORE_NOT_FOUND', 'selected store does not exist', 404);
    }
    const product = await this.prisma.product.findFirst({ where: { id: input.productId, deletedAt: null } });
    if (!product) {
      throw new AppError('INVENTORY_PRODUCT_NOT_FOUND', 'selected product does not exist', 404);
    }

    const created = await this.prisma.restockRequest.create({
      data: {
        storeId,
        productId: input.productId,
        quantity: input.quantity,
        note: input.note,
        requestedBy: actor.id,
      },
      select: RESTOCK_REQUEST_SELECT,
    });
    return toRestockRequestSummary(created);
  }

  /**
   * 補貨請求列表：admin/system_admin 看全部；dealer 只看「自己負責區域」內的分店請求
   * （這就是「發送給同區經銷商」的實際機制——不是真的發訊息，是經銷商本來就只查得到
   * 自己區域的請求，店長一建立，對應區域的經銷商自然就看得到）；manager 只看自己分店的請求。
   * isCompleted 篩選給前端切「待處理／已完成」兩個分頁用。
   */
  async listRestockRequests(actor: AuthenticatedUser, isCompleted?: boolean): Promise<RestockRequestSummary[]> {
    const where: Prisma.RestockRequestWhereInput = {
      ...(isCompleted !== undefined ? { isCompleted } : {}),
      ...(actor.role === 'manager' && actor.storeId ? { storeId: actor.storeId } : {}),
      ...(actor.role === 'dealer' && actor.region ? { store: { region: actor.region } } : {}),
    };

    const requests = await this.prisma.restockRequest.findMany({
      where,
      select: RESTOCK_REQUEST_SELECT,
      orderBy: [{ isCompleted: 'asc' }, { createdAt: 'desc' }],
    });
    return requests.map(toRestockRequestSummary);
  }

  /**
   * 經銷商補完貨之後勾選完成——只允許「看得到這筆請求的人」標記（同一條 dealer 區域規則，
   * admin/system_admin 不受限）。manager 自己不能標記完成，必須由經銷商確認，避免左手蓋右手章。
   */
  async completeRestockRequest(actor: AuthenticatedUser, id: number): Promise<RestockRequestSummary> {
    const existing = await this.prisma.restockRequest.findUnique({
      where: { id },
      select: { id: true, isCompleted: true, store: { select: { region: true } } },
    });
    if (!existing) {
      throw new AppError('RESTOCK_REQUEST_NOT_FOUND', `restock request ${id} not found`, 404);
    }
    if (actor.role === 'dealer' && existing.store.region !== actor.region) {
      throw new AppError('RESTOCK_REQUEST_NOT_FOUND', `restock request ${id} not visible to actor ${actor.id}`, 404);
    }
    if (existing.isCompleted) {
      throw new AppError('RESTOCK_REQUEST_ALREADY_COMPLETED', `restock request ${id} already completed`, 409);
    }

    const updated = await this.prisma.restockRequest.update({
      where: { id },
      data: { isCompleted: true, completedAt: new Date(), completedBy: actor.id },
      select: RESTOCK_REQUEST_SELECT,
    });
    return toRestockRequestSummary(updated);
  }
}

function toRestockRequestSummary(row: {
  id: number;
  storeId: number;
  store: { name: string };
  productId: number;
  product: { name: string };
  quantity: number;
  note: string | null;
  requestedBy: number;
  requester: { name: string };
  isCompleted: boolean;
  completedAt: Date | null;
  completer: { name: string } | null;
  createdAt: Date;
}): RestockRequestSummary {
  return {
    id: row.id,
    storeId: row.storeId,
    storeName: row.store.name,
    productId: row.productId,
    productName: row.product.name,
    quantity: row.quantity,
    note: row.note,
    requestedBy: row.requestedBy,
    requesterName: row.requester.name,
    isCompleted: row.isCompleted,
    completedAt: row.completedAt?.toISOString() ?? null,
    completedByName: row.completer?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toSummary(
  row: { id: number; storeId: number; productId: number; quantity: number; updatedAt: Date },
  product: { name: string; sku: string },
): StoreInventorySummary {
  return {
    id: row.id,
    storeId: row.storeId,
    productId: row.productId,
    productName: product.name,
    productSku: product.sku,
    quantity: row.quantity,
    updatedAt: row.updatedAt.toISOString(),
  };
}
