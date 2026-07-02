/*
  Warnings:

  - You are about to drop the column `document_signed_at` on the `customers` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "customers" DROP COLUMN "document_signed_at",
ADD COLUMN     "document_customer_signed_at" TIMESTAMP(3),
ADD COLUMN     "document_staff_id" INTEGER,
ADD COLUMN     "document_staff_signed_at" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_document_staff_id_fkey" FOREIGN KEY ("document_staff_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
