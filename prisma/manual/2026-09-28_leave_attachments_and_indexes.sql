-- Run once in the Supabase SQL editor BEFORE (or right after) deploying this version.
-- Additive only: no existing data is changed or dropped. Safe to run more than once.
-- Equivalent to `npx prisma db push` for the 2026-09-28 schema changes.

-- Calendar events created from an approved leave (so they can be removed on rejection)
ALTER TABLE "Events" ADD COLUMN IF NOT EXISTS "leaveId" TEXT;

-- Medical certificates / supporting documents
CREATE TABLE IF NOT EXISTS "LeaveAttachment" (
    "id"        TEXT         NOT NULL,
    "leaveId"   TEXT         NOT NULL,
    "fileName"  TEXT         NOT NULL,
    "mimeType"  TEXT         NOT NULL,
    "size"      INTEGER      NOT NULL,
    "data"      BYTEA        NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeaveAttachment_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "LeaveAttachment"
    ADD CONSTRAINT "LeaveAttachment_leaveId_fkey"
    FOREIGN KEY ("leaveId") REFERENCES "Leave"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes for the queries every page runs
CREATE INDEX IF NOT EXISTS "LeaveAttachment_leaveId_idx" ON "LeaveAttachment"("leaveId");
CREATE INDEX IF NOT EXISTS "User_name_idx"               ON "User"("name");
CREATE INDEX IF NOT EXISTS "Leave_userEmail_idx"         ON "Leave"("userEmail");
CREATE INDEX IF NOT EXISTS "Leave_status_idx"            ON "Leave"("status");
CREATE INDEX IF NOT EXISTS "Leave_createdAt_idx"         ON "Leave"("createdAt");
CREATE INDEX IF NOT EXISTS "Events_startDate_idx"        ON "Events"("startDate");
CREATE INDEX IF NOT EXISTS "Events_leaveId_idx"          ON "Events"("leaveId");
CREATE INDEX IF NOT EXISTS "TeamMember_userEmail_idx"    ON "TeamMember"("userEmail");
