-- DropIndex
DROP INDEX "customers_name_trgm_idx";

-- DropIndex
DROP INDEX "customers_national_id_trgm_idx";

-- DropIndex
DROP INDEX "customers_phone_trgm_idx";

-- CreateTable
CREATE TABLE "disclaimer_templates" (
    "id" SERIAL NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disclaimer_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "disclaimer_templates_version_key" ON "disclaimer_templates"("version");
