-- AlterEnum
ALTER TYPE "EmailStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';

-- AlterTable
ALTER TABLE "Email" ADD COLUMN IF NOT EXISTS "to" TEXT;
ALTER TABLE "Email" ADD COLUMN IF NOT EXISTS "previewUrl" TEXT;

-- Backfill "to" with "recipient" for any existing rows
UPDATE "Email" SET "to" = "recipient" WHERE "to" IS NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Email_to_idx" ON "Email"("to");
