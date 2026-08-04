-- CreateTable
CREATE TABLE "customer_treatment_records" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "performed_by_id" INTEGER NOT NULL,
    "performed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "photos" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_treatment_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_treatment_records_customer_id_idx" ON "customer_treatment_records"("customer_id");

-- AddForeignKey
ALTER TABLE "customer_treatment_records" ADD CONSTRAINT "customer_treatment_records_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_treatment_records" ADD CONSTRAINT "customer_treatment_records_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_treatment_records" ADD CONSTRAINT "customer_treatment_records_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
