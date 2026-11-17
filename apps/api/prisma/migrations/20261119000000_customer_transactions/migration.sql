-- 顧客交易主表：把結帳產生的財務紀錄、錢包異動、課程串在一起，系統管理員刪除時可完整回溯
CREATE TYPE "CustomerTransactionKind" AS ENUM ('service', 'plan_purchase', 'top_up');

ALTER TABLE "customer_courses" ADD COLUMN "transaction_id" INTEGER, ADD COLUMN "voided_at" TIMESTAMP(3);
ALTER TABLE "financial_records" ADD COLUMN "deleted_at" TIMESTAMP(3), ADD COLUMN "transaction_id" INTEGER;
ALTER TABLE "wallet_logs" ADD COLUMN "transaction_id" INTEGER;

CREATE TABLE "customer_transactions" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "staff_id" INTEGER NOT NULL,
    "kind" "CustomerTransactionKind" NOT NULL,
    "amount" INTEGER NOT NULL,
    "list_amount" INTEGER NOT NULL,
    "payment_method" "PaymentMethod",
    "payments" JSONB,
    "adjust_note" TEXT,
    "note" TEXT,
    "service_record_id" INTEGER,
    "promotion_plan_id" INTEGER,
    "plan_original" JSONB,
    "plan_actual" JSONB,
    "legacy" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" INTEGER,
    "delete_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customer_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_transaction_logs" (
    "id" SERIAL NOT NULL,
    "transaction_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "operator_id" INTEGER NOT NULL,
    "reason" TEXT,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_transaction_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_transactions_service_record_id_key" ON "customer_transactions"("service_record_id");
CREATE INDEX "customer_transactions_customer_id_created_at_idx" ON "customer_transactions"("customer_id", "created_at");
CREATE INDEX "customer_transactions_store_id_created_at_idx" ON "customer_transactions"("store_id", "created_at");
CREATE INDEX "customer_transaction_logs_transaction_id_idx" ON "customer_transaction_logs"("transaction_id");
CREATE INDEX "financial_records_transaction_id_idx" ON "financial_records"("transaction_id");

ALTER TABLE "wallet_logs" ADD CONSTRAINT "wallet_logs_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "customer_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customer_courses" ADD CONSTRAINT "customer_courses_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "customer_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "financial_records" ADD CONSTRAINT "financial_records_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "customer_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customer_transactions" ADD CONSTRAINT "customer_transactions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_transactions" ADD CONSTRAINT "customer_transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_transactions" ADD CONSTRAINT "customer_transactions_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_transactions" ADD CONSTRAINT "customer_transactions_service_record_id_fkey" FOREIGN KEY ("service_record_id") REFERENCES "service_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customer_transactions" ADD CONSTRAINT "customer_transactions_promotion_plan_id_fkey" FOREIGN KEY ("promotion_plan_id") REFERENCES "promotion_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customer_transactions" ADD CONSTRAINT "customer_transactions_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customer_transaction_logs" ADD CONSTRAINT "customer_transaction_logs_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "customer_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_transaction_logs" ADD CONSTRAINT "customer_transaction_logs_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 舊資料補建：系統上線前的課程各補一筆 legacy 交易（只能看、不能刪，因為無法確定當初的連帶影響）
DO $$
DECLARE
  r RECORD;
  new_id INTEGER;
BEGIN
  FOR r IN
    SELECT cc.id, cc.store_id, cc.customer_id, cc.total_sessions, cc.purchase_price, cc.created_at,
           c.created_by, si.id AS item_id, si.name AS item_name
    FROM customer_courses cc
    JOIN customers c ON c.id = cc.customer_id
    JOIN service_items si ON si.id = cc.service_item_id
    WHERE cc.transaction_id IS NULL
  LOOP
    INSERT INTO customer_transactions
      (store_id, customer_id, staff_id, kind, amount, list_amount, legacy, note, plan_actual, created_at, updated_at)
    VALUES
      (r.store_id, r.customer_id, r.created_by, 'plan_purchase', COALESCE(r.purchase_price, 0), COALESCE(r.purchase_price, 0), true,
       '系統上線前的舊紀錄',
       jsonb_build_object('name', r.item_name, 'type', 'course_bundle',
         'items', jsonb_build_array(jsonb_build_object('serviceItemId', r.item_id, 'name', r.item_name, 'sessions', r.total_sessions))),
       r.created_at, CURRENT_TIMESTAMP)
    RETURNING id INTO new_id;
    UPDATE customer_courses SET transaction_id = new_id WHERE id = r.id;
  END LOOP;
END $$;
