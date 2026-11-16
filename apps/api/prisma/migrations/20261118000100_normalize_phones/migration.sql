-- 電話號碼統一存純數字（0981-675-415 → 0981675415；+886 / 886 開頭 → 0 開頭）。
-- 之後 API 寫入時一律正規化（apps/api/src/common/phone.util.ts），畫面顯示時再加 dash。
-- 只處理去掉符號後為 9～12 位數字的值，其他寫法（例如含文字的備註型電話）保持原樣。

UPDATE "customers"
SET "phone" = CASE
    WHEN regexp_replace("phone", '\D', '', 'g') ~ '^886\d{8,9}$'
      THEN '0' || substr(regexp_replace("phone", '\D', '', 'g'), 4)
    ELSE regexp_replace("phone", '\D', '', 'g')
  END
WHERE "phone" IS NOT NULL
  AND "phone" ~ '^[\d\s\-+()]+$'
  AND length(regexp_replace("phone", '\D', '', 'g')) BETWEEN 9 AND 12;

UPDATE "appointments"
SET "customer_phone" = CASE
    WHEN regexp_replace("customer_phone", '\D', '', 'g') ~ '^886\d{8,9}$'
      THEN '0' || substr(regexp_replace("customer_phone", '\D', '', 'g'), 4)
    ELSE regexp_replace("customer_phone", '\D', '', 'g')
  END
WHERE "customer_phone" IS NOT NULL
  AND "customer_phone" ~ '^[\d\s\-+()]+$'
  AND length(regexp_replace("customer_phone", '\D', '', 'g')) BETWEEN 9 AND 12;
