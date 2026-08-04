-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'transfer', 'line_pay', 'credit_card');

-- CreateEnum
CREATE TYPE "FinancialRecordType" AS ENUM ('income', 'expense');

-- CreateEnum
CREATE TYPE "FinancialCategory" AS ENUM ('sales', 'top_up', 'outsource_payout', 'daily_expense', 'petty_cash_replenish');

-- CreateEnum
CREATE TYPE "ConsumptionType" AS ENUM ('single_purchase', 'wallet_deduction', 'course_deduction');

-- CreateEnum
CREATE TYPE "PromotionPlanType" AS ENUM ('top_up_bonus', 'course_bundle');

-- CreateEnum
CREATE TYPE "WalletMovementType" AS ENUM ('top_up', 'deduction');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'staff';

-- DropIndex
DROP INDEX "customers_national_id_key";

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "exosome_consent_signature_url" TEXT,
ADD COLUMN     "is_exosome_user" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "petty_cash_balance" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "attendance_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "store_id" INTEGER NOT NULL,
    "clock_in_at" TIMESTAMP(3) NOT NULL,
    "clock_out_at" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_items" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "is_outsourced" BOOLEAN NOT NULL DEFAULT false,
    "outsource_cost" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "service_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_plans" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PromotionPlanType" NOT NULL,
    "price" INTEGER NOT NULL,
    "bonus_amount" INTEGER,
    "course_count" INTEGER,
    "service_item_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "promotion_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_wallets" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "bonus_balance" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_logs" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "store_id" INTEGER NOT NULL,
    "type" "WalletMovementType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "bonus_amount" INTEGER NOT NULL DEFAULT 0,
    "performed_by_id" INTEGER NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_courses" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "service_item_id" INTEGER NOT NULL,
    "store_id" INTEGER NOT NULL,
    "total_sessions" INTEGER NOT NULL,
    "used_sessions" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_records" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "type" "FinancialRecordType" NOT NULL,
    "category" "FinancialCategory" NOT NULL,
    "amount" INTEGER NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "performed_by_id" INTEGER NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_records" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "store_id" INTEGER NOT NULL,
    "staff_id" INTEGER NOT NULL,
    "service_item_id" INTEGER NOT NULL,
    "consumption_type" "ConsumptionType" NOT NULL,
    "amount_paid" INTEGER,
    "sessions_deducted" INTEGER,
    "customer_signature_url" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_logs_user_id_idx" ON "attendance_logs"("user_id");

-- CreateIndex
CREATE INDEX "attendance_logs_store_id_clock_in_at_idx" ON "attendance_logs"("store_id", "clock_in_at");

-- CreateIndex
CREATE INDEX "service_items_store_id_idx" ON "service_items"("store_id");

-- CreateIndex
CREATE INDEX "promotion_plans_store_id_idx" ON "promotion_plans"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_wallets_customer_id_key" ON "customer_wallets"("customer_id");

-- CreateIndex
CREATE INDEX "wallet_logs_customer_id_idx" ON "wallet_logs"("customer_id");

-- CreateIndex
CREATE INDEX "wallet_logs_store_id_idx" ON "wallet_logs"("store_id");

-- CreateIndex
CREATE INDEX "customer_courses_customer_id_idx" ON "customer_courses"("customer_id");

-- CreateIndex
CREATE INDEX "financial_records_store_id_created_at_idx" ON "financial_records"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "service_records_customer_id_idx" ON "service_records"("customer_id");

-- CreateIndex
CREATE INDEX "service_records_store_id_created_at_idx" ON "service_records"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "service_records_staff_id_idx" ON "service_records"("staff_id");

-- CreateIndex
CREATE INDEX "customers_store_id_phone_idx" ON "customers"("store_id", "phone");

-- AddForeignKey
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_items" ADD CONSTRAINT "service_items_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_plans" ADD CONSTRAINT "promotion_plans_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_plans" ADD CONSTRAINT "promotion_plans_service_item_id_fkey" FOREIGN KEY ("service_item_id") REFERENCES "service_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_wallets" ADD CONSTRAINT "customer_wallets_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_logs" ADD CONSTRAINT "wallet_logs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_logs" ADD CONSTRAINT "wallet_logs_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_logs" ADD CONSTRAINT "wallet_logs_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_courses" ADD CONSTRAINT "customer_courses_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_courses" ADD CONSTRAINT "customer_courses_service_item_id_fkey" FOREIGN KEY ("service_item_id") REFERENCES "service_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_courses" ADD CONSTRAINT "customer_courses_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_records" ADD CONSTRAINT "financial_records_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_records" ADD CONSTRAINT "financial_records_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_service_item_id_fkey" FOREIGN KEY ("service_item_id") REFERENCES "service_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
