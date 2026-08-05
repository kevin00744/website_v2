-- ============================================================
-- Migration: refactor_role_region_user
-- 1. Add new Role enum values: general_agent, accountant
-- 2. Rename Region enum values: north→A, central→B, south→C
-- 3. Add username, parent_id, dealer_id to users
-- ============================================================

-- Step 1: Add new Role values (ADD VALUE is safe in Postgres, no lock needed)
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'general_agent';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'accountant';

-- Step 2: Rename Region enum values
-- Postgres 10+ supports RENAME VALUE
ALTER TYPE "Region" RENAME VALUE 'north' TO 'A';
ALTER TYPE "Region" RENAME VALUE 'central' TO 'B';
ALTER TYPE "Region" RENAME VALUE 'south' TO 'C';

-- Step 3: Add username column (backfill from email, guaranteed unique since email is unique)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" TEXT;
UPDATE "users" SET "username" = email WHERE "username" IS NULL;
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "users_username_key" ON "users"("username");

-- Step 4: Add parent_id (self-referencing: who created this account)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "parent_id" INTEGER;
ALTER TABLE "users" ADD CONSTRAINT "users_parent_id_fkey"
  FOREIGN KEY ("parent_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- Step 5: Add dealer_id (FK to the dealer user this account belongs to)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dealer_id" INTEGER;
ALTER TABLE "users" ADD CONSTRAINT "users_dealer_id_fkey"
  FOREIGN KEY ("dealer_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
