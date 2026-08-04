-- CreateEnum
CREATE TYPE "PettyCashActionType" AS ENUM ('add', 'remove', 'outsource_deduct', 'expense_deduct');

-- AlterTable
ALTER TABLE "service_records" ADD COLUMN     "payments" JSONB;

-- CreateTable
CREATE TABLE "petty_cash_logs" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "action" "PettyCashActionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "note" TEXT,
    "performed_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "petty_cash_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "petty_cash_logs_store_id_created_at_idx" ON "petty_cash_logs"("store_id", "created_at");

-- AddForeignKey
ALTER TABLE "petty_cash_logs" ADD CONSTRAINT "petty_cash_logs_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "petty_cash_logs" ADD CONSTRAINT "petty_cash_logs_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
