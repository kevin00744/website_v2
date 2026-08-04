/*
  Warnings:

  - You are about to drop the column `course_count` on the `promotion_plans` table. All the data in the column will be lost.
  - You are about to drop the column `service_item_id` on the `promotion_plans` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "promotion_plans" DROP CONSTRAINT "promotion_plans_service_item_id_fkey";

-- AlterTable
ALTER TABLE "promotion_plans" DROP COLUMN "course_count",
DROP COLUMN "service_item_id";

-- CreateTable
CREATE TABLE "promotion_plan_items" (
    "id" SERIAL NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "service_item_id" INTEGER NOT NULL,
    "sessions" INTEGER NOT NULL,

    CONSTRAINT "promotion_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "promotion_plan_items_plan_id_idx" ON "promotion_plan_items"("plan_id");

-- AddForeignKey
ALTER TABLE "promotion_plan_items" ADD CONSTRAINT "promotion_plan_items_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "promotion_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_plan_items" ADD CONSTRAINT "promotion_plan_items_service_item_id_fkey" FOREIGN KEY ("service_item_id") REFERENCES "service_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
