ALTER TABLE "Email" ADD COLUMN "indexedAt" TIMESTAMP(3);
CREATE INDEX "Email_indexedAt_idx" ON "Email"("indexedAt");
