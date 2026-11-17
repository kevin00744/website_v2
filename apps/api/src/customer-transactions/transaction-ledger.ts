import type { CustomerTransactionKind, PaymentMethod, Prisma } from '@prisma/client';

/** 方案內容快照：原方案 / 實際成交 */
export interface PlanSnapshot {
  name: string;
  type: 'course_bundle' | 'top_up_bonus';
  price: number;
  bonusAmount?: number | null;
  items: Array<{ serviceItemId: number; name: string; sessions: number }>;
}

/**
 * 交易建立時記下的連帶效果，系統管理員刪除時依此回溯。
 * 財務紀錄 / 錢包異動 / 方案課程另外用 transactionId 關聯，這裡只放「關聯查不到」的資訊。
 */
export interface TransactionEffects {
  /** POS 扣堂：先買先用、可能跨多份課程，各扣幾堂 */
  courseDeductions?: Array<{ customerCourseId: number; sessions: number }>;
  /** 舊格式（單一課程），讀取時相容 */
  courseDeduction?: { customerCourseId: number; sessions: number };
  /** 課程退費 / 退課轉儲值：從哪份課程退了幾堂 */
  courseRefund?: { customerCourseId: number; sessions: number };
}

export interface CreateLedgerInput {
  storeId: number;
  customerId: number;
  staffId: number;
  operatorId: number;
  kind: CustomerTransactionKind;
  amount: number;
  listAmount: number;
  paymentMethod?: PaymentMethod | null;
  payments?: Array<{ method: PaymentMethod; amount: number }> | null;
  adjustNote?: string | null;
  note?: string | null;
  promotionPlanId?: number | null;
  planOriginal?: PlanSnapshot | null;
  planActual?: PlanSnapshot | null;
}

/**
 * 在同一個 Prisma transaction 內建立交易主表 + 「建立」歷程。
 * 呼叫端拿到 id 後，把它寫進對應的 FinancialRecord / WalletLog / CustomerCourse。
 */
export async function createLedgerEntry(tx: Prisma.TransactionClient, input: CreateLedgerInput) {
  const adjustNote = input.adjustNote?.trim() || null;
  const txn = await tx.customerTransaction.create({
    data: {
      storeId: input.storeId,
      customerId: input.customerId,
      staffId: input.staffId,
      kind: input.kind,
      amount: input.amount,
      listAmount: input.listAmount,
      paymentMethod: input.paymentMethod ?? null,
      payments: input.payments ? (input.payments as unknown as Prisma.InputJsonValue) : undefined,
      adjustNote,
      note: input.note?.trim() || null,
      promotionPlanId: input.promotionPlanId ?? null,
      planOriginal: input.planOriginal ? (input.planOriginal as unknown as Prisma.InputJsonValue) : undefined,
      planActual: input.planActual ? (input.planActual as unknown as Prisma.InputJsonValue) : undefined,
    },
  });
  await tx.customerTransactionLog.create({
    data: {
      transactionId: txn.id,
      action: 'create',
      operatorId: input.operatorId,
      reason: adjustNote,
      detail: {
        amount: input.amount,
        listAmount: input.listAmount,
        adjusted: input.amount !== input.listAmount || planChanged(input.planOriginal, input.planActual),
      },
    },
  });
  return txn;
}

/** 記下回溯用的效果（例如 POS 扣堂扣的是哪張課程）到「建立」歷程 */
export async function recordEffects(tx: Prisma.TransactionClient, transactionId: number, effects: TransactionEffects) {
  const log = await tx.customerTransactionLog.findFirst({ where: { transactionId, action: 'create' } });
  if (!log) return;
  const detail = (log.detail ?? {}) as Record<string, unknown>;
  await tx.customerTransactionLog.update({
    where: { id: log.id },
    data: { detail: { ...detail, effects } as unknown as Prisma.InputJsonValue },
  });
}

/** 讀取扣堂明細（相容舊的單筆格式） */
export function deductionsOf(effects?: TransactionEffects | null): Array<{ customerCourseId: number; sessions: number }> {
  if (!effects) return [];
  if (effects.courseDeductions?.length) return effects.courseDeductions;
  return effects.courseDeduction ? [effects.courseDeduction] : [];
}

/** 從交易的「建立」歷程取出記錄的效果 */
export async function effectsOf(tx: Prisma.TransactionClient, transactionId: number): Promise<TransactionEffects | undefined> {
  const log = await tx.customerTransactionLog.findFirst({ where: { transactionId, action: 'create' } });
  return ((log?.detail ?? {}) as { effects?: TransactionEffects }).effects;
}

export function planChanged(original?: PlanSnapshot | null, actual?: PlanSnapshot | null): boolean {
  if (!original || !actual) return false;
  if (original.price !== actual.price) return true;
  if ((original.bonusAmount ?? 0) !== (actual.bonusAmount ?? 0)) return true;
  if (original.items.length !== actual.items.length) return true;
  return original.items.some((o) => {
    const a = actual.items.find((i) => i.serviceItemId === o.serviceItemId);
    return !a || a.sessions !== o.sessions;
  });
}
