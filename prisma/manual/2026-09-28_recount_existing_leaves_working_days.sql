-- Recount EXISTING leaves in working days (Mon–Fri, excluding holidays).
-- Leaves submitted before this change counted Saturdays/Sundays/holidays.
-- Balances on the portal/dashboard and the leave-card export are computed from
-- Leave.days, so fixing Leave.days fixes the displayed balances.
--
-- Scope: full-day Annual / Sick / Personal / Special leaves spanning more than
-- one date, not rejected, not multi-segment. Maternity (calendar days) untouched.
--
-- STEP 1 — PREVIEW (changes nothing). Check the list looks right.

WITH holidays AS (
  SELECT DISTINCT gs::date AS d
  FROM "Events" e,
       generate_series(
         ((e."startDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Phnom_Penh')::date,
         ((COALESCE(e."endDate", e."startDate") AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Phnom_Penh')::date,
         interval '1 day') gs
  WHERE e."leaveId" IS NULL
    AND e.title NOT LIKE '%ឈប់សម្រាក%'
    AND e.title !~* 'on\s+\w.*Leave'
),
recalc AS (
  SELECT l.id, l."userName", l.type, l.status,
         l."startDate"::date AS start_date, l."endDate"::date AS end_date,
         l.days AS old_days,
         (SELECT count(*)
            FROM generate_series(l."startDate"::date, l."endDate"::date, interval '1 day') g
           WHERE extract(isodow FROM g) < 6
             AND g::date NOT IN (SELECT d FROM holidays))::int AS new_days
  FROM "Leave" l
  WHERE l.status <> 'REJECTED'
    AND l.type IN ('ANNUAL', 'SICK', 'PERSONAL', 'SPECIAL')
    AND (l.segments IS NULL OR l.segments = 'null'::jsonb)
    AND COALESCE(l.hours, 0) = 0
    AND l."startDate"::date < l."endDate"::date
)
SELECT * FROM recalc
WHERE new_days <> old_days AND new_days > 0
ORDER BY start_date;


-- STEP 2 — APPLY. Uncomment and run after checking the preview.
/*
WITH holidays AS (
  SELECT DISTINCT gs::date AS d
  FROM "Events" e,
       generate_series(
         ((e."startDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Phnom_Penh')::date,
         ((COALESCE(e."endDate", e."startDate") AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Phnom_Penh')::date,
         interval '1 day') gs
  WHERE e."leaveId" IS NULL
    AND e.title NOT LIKE '%ឈប់សម្រាក%'
    AND e.title !~* 'on\s+\w.*Leave'
),
recalc AS (
  SELECT l.id, l.days AS old_days,
         (SELECT count(*)
            FROM generate_series(l."startDate"::date, l."endDate"::date, interval '1 day') g
           WHERE extract(isodow FROM g) < 6
             AND g::date NOT IN (SELECT d FROM holidays))::int AS new_days
  FROM "Leave" l
  WHERE l.status <> 'REJECTED'
    AND l.type IN ('ANNUAL', 'SICK', 'PERSONAL', 'SPECIAL')
    AND (l.segments IS NULL OR l.segments = 'null'::jsonb)
    AND COALESCE(l.hours, 0) = 0
    AND l."startDate"::date < l."endDate"::date
)
UPDATE "Leave" l
SET days = r.new_days, "updatedAt" = now()
FROM recalc r
WHERE l.id = r.id AND r.new_days <> r.old_days AND r.new_days > 0;
*/
