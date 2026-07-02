-- CreateEnum
CREATE TYPE "InquiryCategoryKind" AS ENUM ('franchise', 'experience', 'other');

-- CreateTable
CREATE TABLE "inquiry_categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "InquiryCategoryKind" NOT NULL DEFAULT 'other',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inquiry_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_messages" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "city" TEXT NOT NULL,
    "region" "Region" NOT NULL,
    "message" TEXT,
    "categoryId" INTEGER NOT NULL,
    "store_id" INTEGER,
    "forwarded_at" TIMESTAMP(3),
    "forwarded_by" INTEGER,
    "is_handled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_messages_region_categoryId_idx" ON "contact_messages"("region", "categoryId");

-- CreateIndex
CREATE INDEX "contact_messages_store_id_idx" ON "contact_messages"("store_id");

-- AddForeignKey
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "inquiry_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_forwarded_by_fkey" FOREIGN KEY ("forwarded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
