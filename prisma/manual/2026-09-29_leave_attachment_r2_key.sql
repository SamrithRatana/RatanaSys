-- Certificates uploaded from now on are stored in Cloudflare R2 (bucket
-- "cam-storage") instead of the database; this adds the column that points
-- to the R2 object, and makes the old `data` column optional since new rows
-- won't use it. Existing certificates already in `data` are untouched and
-- keep working exactly as before.
--
-- Additive only, safe to run twice.

ALTER TABLE "LeaveAttachment" ADD COLUMN IF NOT EXISTS "r2Key" TEXT;
ALTER TABLE "LeaveAttachment" ALTER COLUMN "data" DROP NOT NULL;
