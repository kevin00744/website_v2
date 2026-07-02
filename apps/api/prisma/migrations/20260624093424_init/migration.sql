-- CreateEnum
CREATE TYPE "Role" AS ENUM ('system_admin', 'admin', 'editor', 'dealer', 'manager');

-- CreateEnum
CREATE TYPE "Region" AS ENUM ('north', 'central', 'south');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('disclaimer', 'id_document');

-- CreateEnum
CREATE TYPE "SignerRole" AS ENUM ('customer', 'staff');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "phone" TEXT,
    "store_id" INTEGER,
    "region" "Region",
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" "Region" NOT NULL,
    "region_sequence" INTEGER NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "note" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "line" TEXT,
    "email" TEXT,
    "address" TEXT,
    "note" TEXT,
    "national_id" TEXT,
    "customer_code" TEXT,
    "store_id" INTEGER NOT NULL,
    "created_by" INTEGER NOT NULL,
    "document_path" TEXT,
    "document_signed_at" TIMESTAMP(3),
    "disclaimer_customer_signed_at" TIMESTAMP(3),
    "disclaimer_staff_signed_at" TIMESTAMP(3),
    "disclaimer_staff_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signatures" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "signer_role" "SignerRole" NOT NULL,
    "signer_user_id" INTEGER,
    "signature_image_url" TEXT NOT NULL,
    "signature_points_json" JSONB,
    "content_snapshot" JSONB NOT NULL,
    "content_hash" TEXT NOT NULL,
    "record_hash" TEXT NOT NULL,
    "signed_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "device_info" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signatures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "stores_code_key" ON "stores"("code");

-- CreateIndex
CREATE UNIQUE INDEX "customers_national_id_key" ON "customers"("national_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_customer_code_key" ON "customers"("customer_code");

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers"("name");

-- CreateIndex
CREATE INDEX "customers_phone_idx" ON "customers"("phone");

-- CreateIndex
CREATE INDEX "signatures_customer_id_document_type_idx" ON "signatures"("customer_id", "document_type");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_disclaimer_staff_id_fkey" FOREIGN KEY ("disclaimer_staff_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_signer_user_id_fkey" FOREIGN KEY ("signer_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
