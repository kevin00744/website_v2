-- Customer 新欄位
ALTER TABLE customers ADD COLUMN IF NOT EXISTS has_exosome_consent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS exosome_consent_signed_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS store_credit DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CustomerCourse 新欄位
ALTER TABLE customer_courses ADD COLUMN IF NOT EXISTS purchase_price INTEGER;

-- ServiceRecord 還原欄位
ALTER TABLE service_records ADD COLUMN IF NOT EXISTS is_rolled_back BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE service_records ADD COLUMN IF NOT EXISTS rolled_back_at TIMESTAMPTZ;
ALTER TABLE service_records ADD COLUMN IF NOT EXISTS rollback_operator_id INTEGER REFERENCES users(id);

-- ExosomeConsentLog
CREATE TABLE IF NOT EXISTS exosome_consent_logs (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signature_url TEXT NOT NULL,
  signature_points JSONB,
  operator_id INTEGER NOT NULL REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exosome_consent_logs_customer_id ON exosome_consent_logs(customer_id);

-- CourseRefundToCreditLog
CREATE TABLE IF NOT EXISTS course_refund_to_credit_logs (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  customer_course_id INTEGER NOT NULL REFERENCES customer_courses(id),
  refunded_sessions INTEGER NOT NULL,
  calculated_amount DECIMAL(12,2) NOT NULL,
  final_amount DECIMAL(12,2) NOT NULL,
  operator_id INTEGER NOT NULL REFERENCES users(id),
  remark TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_course_refund_logs_customer_id ON course_refund_to_credit_logs(customer_id);

-- CourseConversionLog
CREATE TABLE IF NOT EXISTS course_conversion_logs (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  from_course_id INTEGER NOT NULL REFERENCES customer_courses(id),
  to_course_id INTEGER NOT NULL REFERENCES customer_courses(id),
  converted_sessions INTEGER NOT NULL,
  operator_id INTEGER NOT NULL REFERENCES users(id),
  remark TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_course_conversion_logs_customer_id ON course_conversion_logs(customer_id);
