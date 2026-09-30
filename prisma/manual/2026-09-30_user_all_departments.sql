-- Lets a Moderator be scoped to every department instead of just their own
-- (e.g. a General Manager who signs off on all departments' leaves, not
-- only their home department's). Defaults to false — no behavior change
-- for existing moderators until this is turned on for a specific user.
--
-- Additive only, safe to run twice.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "allDepartments" BOOLEAN NOT NULL DEFAULT false;
