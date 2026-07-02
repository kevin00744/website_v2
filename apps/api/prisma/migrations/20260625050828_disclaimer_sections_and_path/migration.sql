/*
  Warnings:

  - You are about to drop the column `body` on the `disclaimer_templates` table. All the data in the column will be lost.
  - Added the required column `sections` to the `disclaimer_templates` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "disclaimer_path" TEXT;

-- AlterTable
ALTER TABLE "disclaimer_templates" DROP COLUMN "body",
ADD COLUMN     "sections" JSONB NOT NULL;
