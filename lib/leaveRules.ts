// Shared leave policy rules — imported by both the request form (client) and
// the API routes (server) so the two can never disagree.

export const COMPANY_TIMEZONE = "Asia/Phnom_Penh";

export const WORK_HOURS_PER_DAY = 8;
const WORK_START_MIN  = 8 * 60;   // 08:00
const WORK_END_MIN    = 17 * 60;  // 17:00
const LUNCH_START_MIN = 12 * 60;  // 12:00
const LUNCH_END_MIN   = 13 * 60;  // 13:00

// ច្បាប់ប្រចាំឆ្នាំ — ត្រូវស្នើសុំមុនយ៉ាងហោចណាស់ 2 ថ្ងៃ
export const ANNUAL_MIN_NOTICE_DAYS = 2;
// ច្បាប់ពិសេស — ត្រូវស្នើសុំមុនយ៉ាងហោចណាស់ 7 ថ្ងៃ
export const SPECIAL_MIN_NOTICE_DAYS = 7;
// ច្បាប់ឈឺ — លើសពី 2 ថ្ងៃ ត្រូវភ្ជាប់សំបុត្រពេទ្យ
export const SICK_CERTIFICATE_THRESHOLD_DAYS = 2;

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];

export const LEAVE_TYPES = ["ANNUAL", "SICK", "PERSONAL", "MATERNITY", "SPECIAL", "SHORT"] as const;
export type LeaveTypeCode = (typeof LEAVE_TYPES)[number];

export const MATERNITY_DAYS: Record<"MALE" | "FEMALE", number> = { MALE: 7, FEMALE: 90 };

// ── Date helpers (all dates are "yyyy-MM-dd" strings) ────────────────────────

/** Today's date in the company timezone, regardless of the server's timezone. */
export function todayYmd(now: Date = new Date()): string {
  // en-CA formats as yyyy-MM-dd
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: COMPANY_TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function isValidYmd(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00.000Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Accepts "yyyy-MM-dd" or a full ISO string and returns "yyyy-MM-dd". */
export function toYmd(s: string): string {
  return s.split("T")[0];
}

export function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Inclusive number of calendar days between two dates. */
export function inclusiveDays(startYmd: string, endYmd: string): number {
  const s = Date.parse(`${startYmd}T12:00:00.000Z`);
  const e = Date.parse(`${endYmd}T12:00:00.000Z`);
  return Math.round((e - s) / 86_400_000) + 1;
}

// ── Working days (Mon–Fri, excluding company holidays) ───────────────────────

// Maternity is counted in calendar days; every other leave in working days
export const CALENDAR_DAY_TYPES = ["MATERNITY"];

/** Calendar events auto-created from leaves (vs. holidays added by admins). */
export function isLeaveEventTitle(title: string): boolean {
  return /\bon\s+\w.*Leave\b/i.test(title) || title.includes("ឈប់សម្រាក");
}

/** Company-timezone dates covered by a holiday event (inclusive, max 60 days). */
export function eventYmds(startDate: Date | string, endDate?: Date | string | null): string[] {
  const start = todayYmd(new Date(startDate));
  const end   = endDate ? todayYmd(new Date(endDate)) : start;
  const out: string[] = [];
  for (let d = start; d <= end && out.length < 60; d = addDaysYmd(d, 1)) out.push(d);
  return out;
}

/** Holiday dates from a list of calendar events (leave events are ignored). */
export function holidayYmds(
  events: { title: string; startDate: Date | string; endDate?: Date | string | null; leaveId?: string | null }[],
): string[] {
  const set = new Set<string>();
  for (const e of events) {
    if (e.leaveId || isLeaveEventTitle(e.title)) continue;
    for (const d of eventYmds(e.startDate, e.endDate)) set.add(d);
  }
  return [...set].sort();
}

export function isWeekendYmd(ymd: string): boolean {
  const dow = new Date(`${ymd}T12:00:00.000Z`).getUTCDay();
  return dow === 0 || dow === 6;
}

export function isWorkingDay(ymd: string, holidays: ReadonlySet<string>): boolean {
  return !isWeekendYmd(ymd) && !holidays.has(ymd);
}

/** Working days between two dates, inclusive. */
export function countWorkingDays(startYmd: string, endYmd: string, holidays: ReadonlySet<string>): number {
  let n = 0;
  for (let d = startYmd; d <= endYmd; d = addDaysYmd(d, 1)) {
    if (isWorkingDay(d, holidays)) n++;
  }
  return n;
}

/** Local calendar date of a Date object as yyyy-MM-dd (for the browser date pickers). */
export function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function noticeDays(type: string | undefined): number {
  const t = (type ?? "").toUpperCase();
  if (t === "ANNUAL")  return ANNUAL_MIN_NOTICE_DAYS;
  if (t === "SPECIAL") return SPECIAL_MIN_NOTICE_DAYS;
  return 0;
}

/** The date `n` working days after `ymd` (weekends and holidays skipped). */
export function addWorkingDaysYmd(ymd: string, n: number, holidays: ReadonlySet<string>): string {
  let d = ymd;
  for (let added = 0, guard = 0; added < n && guard < 400; guard++) {
    d = addDaysYmd(d, 1);
    if (isWorkingDay(d, holidays)) added++;
  }
  return d;
}

/**
 * Earliest start date allowed for a leave type. The notice period counts
 * working days: Annual on a Friday → Tuesday at the earliest (Mon, Tue).
 */
export function minStartYmd(
  type:     string,
  today:    string = todayYmd(),
  holidays: ReadonlySet<string> = new Set(),
): string {
  return addWorkingDaysYmd(today, noticeDays(type), holidays);
}

/** Same as minStartYmd but as a local-midnight Date, for the client calendar. */
export function minStartDate(
  type:     string | undefined,
  today:    Date,
  holidays: ReadonlySet<string> = new Set(),
): Date {
  const [y, m, d] = addWorkingDaysYmd(localYmd(today), noticeDays(type), holidays).split("-").map(Number);
  return new Date(y, m - 1, d);
}

// ── Hours ────────────────────────────────────────────────────────────────────

function hhmmToMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Working hours between two "HH:mm" times, clipped to 08:00–17:00 and
 * excluding the 12:00–13:00 lunch break (so 08:00–17:00 = 8h, 13:00–17:00 = 4h).
 */
export function workHoursBetween(start: string, end: string): number {
  const s = hhmmToMinutes(start);
  const e = hhmmToMinutes(end);
  if (s === null || e === null) return 0;
  const from = Math.max(s, WORK_START_MIN);
  const to   = Math.min(e, WORK_END_MIN);
  if (to <= from) return 0;
  const lunch = Math.max(0, Math.min(to, LUNCH_END_MIN) - Math.max(from, LUNCH_START_MIN));
  return Math.round(((to - from - lunch) / 60) * 100) / 100;
}

/** Total leave expressed in days (hours converted at 8h/day). */
export function toDayFraction(days: number, hours: number): number {
  return (days || 0) + (hours || 0) / WORK_HOURS_PER_DAY;
}

/**
 * Day total of a stored Leave record. Older hourly leaves of 8h+ were saved as
 * days=1 AND hours=8, which would count twice — partial hours are always < 8.
 */
export function leaveDayTotal(days: number | null | undefined, hours: number | null | undefined): number {
  const d = Number(days ?? 0);
  const h = Number(hours ?? 0);
  if (d >= 1 && h >= WORK_HOURS_PER_DAY) return d;
  return toDayFraction(d, h);
}

export function requiresSickCertificate(type: string, totalDays: number): boolean {
  return type.toUpperCase() === "SICK" && totalDays > SICK_CERTIFICATE_THRESHOLD_DAYS;
}

// ── Messages (Khmer + English) ───────────────────────────────────────────────

export const RULE_MESSAGES = {
  nonWorkingDay:
    "ថ្ងៃដែលបានជ្រើសរើសជាថ្ងៃសៅរ៍ អាទិត្យ ឬថ្ងៃឈប់សម្រាក — មិនចាំបាច់សុំច្បាប់ទេ (The selected date is a weekend or holiday).",
  annualNotice:
    `ច្បាប់ប្រចាំឆ្នាំត្រូវស្នើសុំមុនយ៉ាងហោចណាស់ ${ANNUAL_MIN_NOTICE_DAYS} ថ្ងៃធ្វើការ (Annual leave must be requested at least ${ANNUAL_MIN_NOTICE_DAYS} working days in advance).`,
  specialNotice:
    `ច្បាប់ពិសេសត្រូវស្នើសុំមុនយ៉ាងហោចណាស់ ${SPECIAL_MIN_NOTICE_DAYS} ថ្ងៃធ្វើការ (Special leave must be requested at least ${SPECIAL_MIN_NOTICE_DAYS} working days in advance).`,
  sickCertificate:
    `ច្បាប់ឈឺលើសពី ${SICK_CERTIFICATE_THRESHOLD_DAYS} ថ្ងៃ ត្រូវភ្ជាប់រូបភាព ឬឯកសារសំបុត្រពេទ្យ (Sick leave over ${SICK_CERTIFICATE_THRESHOLD_DAYS} days requires a medical certificate).`,
  attachmentType:
    "ឯកសារភ្ជាប់ត្រូវតែជារូបភាព (JPG/PNG/WEBP/HEIC) ឬ PDF (Attachment must be an image or PDF).",
  attachmentSize:
    `ឯកសារភ្ជាប់ធំពេក — អតិបរមា ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB (Attachment too large).`,
};
