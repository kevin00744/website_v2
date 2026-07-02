-- 啟用 pg_trgm，讓 Postgres 可以用 trigram（三字元片段）比對字串相似度，
-- 這是支援「任意位置模糊比對」（ILIKE '%關鍵字%'）效能的關鍵：一般 B-tree index
-- 只能加速「從頭比對」（例如 LIKE '關鍵字%'），對顧客搜尋這種「打中間幾個字也要找到」沒有用。
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 對 name/phone/national_id 三個欄位各建一個 GIN trigram index，
-- CustomersService.searchCustomers() 用的 ILIKE 查詢會自動吃到這幾個 index。
CREATE INDEX IF NOT EXISTS customers_name_trgm_idx ON customers USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_phone_trgm_idx ON customers USING GIN (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_national_id_trgm_idx ON customers USING GIN (national_id gin_trgm_ops);
