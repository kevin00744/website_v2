-- 課程退費：交易種類與財務分類
ALTER TYPE "CustomerTransactionKind" ADD VALUE IF NOT EXISTS 'refund';
ALTER TYPE "CustomerTransactionKind" ADD VALUE IF NOT EXISTS 'refund_to_credit';
ALTER TYPE "FinancialCategory" ADD VALUE IF NOT EXISTS 'refund';
