-- Fixes: "Internal server error" on every leave submission.
--
-- The `substitute` column has been in prisma/schema.prisma since before this
-- session (commit 8a9dae8, "CAMProfess22"), but no migration ever created it
-- in the real database. Nothing wrote to it until app/api/leave/route.ts was
-- rewritten to always set it, so every leave.create() has been failing with
-- a Postgres "column does not exist" error since that change deployed.
--
-- Additive only — one nullable column, no data changed. Safe to run twice.

ALTER TABLE "Leave" ADD COLUMN IF NOT EXISTS "substitute" TEXT;
