-- 把補建的舊交易（legacy）接回當初的財務紀錄，讓系統管理員也能刪除並回溯。
-- 舊程式寫入財務紀錄時沒有關聯欄位，只在說明寫「（顧客 #<id>）」；同一次購買的課程與財務紀錄
-- 在同一個資料庫 transaction 內寫入，建立時間相差在毫秒級，這裡用 5 秒內 + 顧客編號比對。
DO $$
DECLARE
  t RECORD;
  linked_total INTEGER;
  linked_method "PaymentMethod";
BEGIN
  FOR t IN
    SELECT ct.id, ct.customer_id, ct.staff_id, MIN(cc.created_at) AS course_at
    FROM customer_transactions ct
    JOIN customer_courses cc ON cc.transaction_id = ct.id
    WHERE ct.legacy = true AND ct.deleted_at IS NULL
    GROUP BY ct.id, ct.customer_id, ct.staff_id
  LOOP
    UPDATE financial_records fr
    SET transaction_id = t.id
    WHERE fr.transaction_id IS NULL
      AND fr.deleted_at IS NULL
      AND fr.type = 'income'
      AND fr.description LIKE '%（顧客 #' || t.customer_id || '）%'
      AND fr.created_at BETWEEN t.course_at - INTERVAL '5 seconds' AND t.course_at + INTERVAL '5 seconds';

    SELECT COALESCE(SUM(amount), 0), MIN(payment_method::text)::"PaymentMethod"
      INTO linked_total, linked_method
    FROM financial_records
    WHERE transaction_id = t.id;

    IF linked_total > 0 THEN
      UPDATE customer_transactions
      SET legacy = false,
          amount = linked_total,
          list_amount = linked_total,
          payment_method = linked_method,
          plan_actual = COALESCE(plan_actual, '{}'::jsonb) || jsonb_build_object('price', linked_total),
          plan_original = COALESCE(plan_original, plan_actual, '{}'::jsonb) || jsonb_build_object('price', linked_total),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = t.id;

      INSERT INTO customer_transaction_logs (transaction_id, action, operator_id, reason, detail)
      VALUES (t.id, 'create', t.staff_id, '系統上線前的紀錄，已補建與財務紀錄的連結',
              jsonb_build_object('amount', linked_total, 'listAmount', linked_total, 'adjusted', false));
    END IF;
  END LOOP;
END $$;
