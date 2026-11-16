-- LINE Bot 整合（測試期僅 system_admin 可見）

-- 預約來源
CREATE TYPE "AppointmentSource" AS ENUM ('staff', 'line');
ALTER TABLE "appointments" ADD COLUMN "source" "AppointmentSource" NOT NULL DEFAULT 'staff';

-- LINE 帳號綁定
CREATE TABLE "line_accounts" (
    "id" SERIAL NOT NULL,
    "line_user_id" TEXT NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "display_name" TEXT NOT NULL,
    "picture_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "line_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "line_accounts_line_user_id_key" ON "line_accounts"("line_user_id");
CREATE UNIQUE INDEX "line_accounts_customer_id_key" ON "line_accounts"("customer_id");

ALTER TABLE "line_accounts" ADD CONSTRAINT "line_accounts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- LINE Bot 系統帳號：作為 LINE 自助建檔顧客 / LINE 預約的 created_by。
-- is_active=false 且密碼為不可能符合的 bcrypt 字串 → 無法登入。
-- 其 id 需填入環境變數 LINE_BOT_USER_ID（可用 SELECT id FROM users WHERE username='line-bot' 查詢）。
INSERT INTO "users" ("username", "name", "password", "role", "is_active", "created_at", "updated_at")
SELECT 'line-bot', 'LINE Bot', '!disabled-account-no-login', 'staff', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "users" WHERE "username" = 'line-bot');
