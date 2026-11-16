-- 顧客軟刪除記錄刪除者（店長刪除後 3 天內可還原）
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "deleted_by_id" INTEGER;
ALTER TABLE "customers" ADD CONSTRAINT "customers_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
