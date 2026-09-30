// Server-side helpers shared by the /api/leave routes: request validation,
// duration calculation and Telegram message formatting.

import { format } from "date-fns";
import { heicToJpeg, isHeic } from "@/lib/heic";
import {
  ALLOWED_ATTACHMENT_TYPES,
  MATERNITY_DAYS,
  MAX_ATTACHMENT_BYTES,
  RULE_MESSAGES,
  WORK_HOURS_PER_DAY,
  MAX_WORKING_DAY_SPAN_DAYS,
  addDaysYmd,
  countWorkingDays,
  endDateForWorkingDays,
  isValidYmd,
  isWorkingDay,
  minStartYmd,
  requiresSickCertificate,
  toDayFraction,
  toYmd,
  workHoursBetween,
} from "@/lib/leaveRules";

export type StoredSegment = {
  date:        string;
  endDate?:    string;
  hours?:      number;
  days?:       number;
  startTime?:  string;
  endTime?:    string;
  substitute?: string | null;
};

export type SubmittedLeave = {
  notes?:           string;
  leave?:           string;
  type?:            string;
  maternityGender?: "MALE" | "FEMALE";
  startDate?:       string;
  endDate?:         string;
  hours?:           number;
  days?:            number;
  segments?:        StoredSegment[];
  startTime?:       string;
  endTime?:         string;
  substitute?:      string | null;
  // The certificate, base64-encoded inside the JSON body (see app/api/leave/route.ts)
  attachment?:      { fileName?: string; mimeType?: string; base64?: string } | null;
  // "ជំពាក់សិន" — sick leave over the threshold, certificate to be uploaded later
  certificateLater?: boolean;
};

export type ComputedLeave = {
  type:             string;
  startYmd:         string;
  endYmd:           string;
  days:             number;
  hours:            number;
  segments:         StoredSegment[] | null;
  maternityGender?: "MALE" | "FEMALE";
  startTime?:       string;
  endTime?:         string;
  substitute:       string | null;
  notes:            string;
};

const SUBMITTABLE_TYPES = ["ANNUAL", "SICK", "PERSONAL", "MATERNITY", "SPECIAL"];
const FLEXIBLE_TYPES    = ["ANNUAL", "SICK", "PERSONAL"];

export class LeaveValidationError extends Error {}

function fail(message: string): never {
  throw new LeaveValidationError(message);
}

/** Store dates at 12:00 UTC so they never shift a day in any timezone. */
export function ymdToDate(ymd: string): Date {
  return new Date(`${ymd}T12:00:00.000Z`);
}

export function dateToYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function clampHours(h: unknown): number {
  const n = Number(h);
  if (!isFinite(n) || n <= 0) return 0;
  return Math.min(n, WORK_HOURS_PER_DAY);
}

/** Roll whole 8h blocks of partial hours into days. */
function normalise(days: number, hours: number): { days: number; hours: number } {
  const extraDays = Math.floor(hours / WORK_HOURS_PER_DAY);
  return {
    days:  days + extraDays,
    hours: Math.round((hours - extraDays * WORK_HOURS_PER_DAY) * 100) / 100,
  };
}

function checkEarliestStart(type: string, startYmd: string, today: string, holidays: ReadonlySet<string>) {
  const min = minStartYmd(type, today, holidays);
  if (startYmd >= min) return;
  if (type === "ANNUAL")  fail(RULE_MESSAGES.annualNotice);
  if (type === "SPECIAL") fail(RULE_MESSAGES.specialNotice);
  fail("មិនអាចស្នើសុំច្បាប់សម្រាប់ថ្ងៃកន្លងផុតបានទេ (Cannot request leave for a past date).");
}

function workingDaysOrFail(startYmd: string, endYmd: string, holidays: ReadonlySet<string>): number {
  const days = countWorkingDays(startYmd, endYmd, holidays);
  if (days === 0) fail(RULE_MESSAGES.nonWorkingDay);
  return days;
}

function normaliseSegment(seg: StoredSegment, type: string, today: string, holidays: ReadonlySet<string>): StoredSegment {
  const date = seg?.date ? toYmd(seg.date) : "";
  if (!isValidYmd(date)) fail("កាលបរិច្ឆេទមិនត្រឹមត្រូវ (Invalid segment date).");
  checkEarliestStart(type, date, today, holidays);

  const substitute = typeof seg.substitute === "string" && seg.substitute.trim() ? seg.substitute.trim() : null;
  const isPartial  = !!(seg.startTime && seg.endTime) || (!(Number(seg.days) >= 1) && Number(seg.hours) > 0);

  if (!isPartial) {
    const endDate = seg.endDate ? toYmd(seg.endDate) : date;
    if (!isValidYmd(endDate) || endDate < date) fail("ថ្ងៃបញ្ចប់ត្រូវតែក្រោយថ្ងៃចាប់ផ្ដើម (End date must be after start date).");
    return { date, endDate, days: workingDaysOrFail(date, endDate, holidays), substitute };
  }

  const hours =
    seg.startTime && seg.endTime
      ? workHoursBetween(seg.startTime, seg.endTime)
      : clampHours(seg.hours);
  if (hours <= 0) fail("ម៉ោងបញ្ចប់ត្រូវតែក្រោយម៉ោងចាប់ផ្ដើម (End time must be after start time).");
  if (!isWorkingDay(date, holidays)) fail(RULE_MESSAGES.nonWorkingDay);

  if (hours >= WORK_HOURS_PER_DAY) return { date, endDate: date, days: 1, substitute };
  return { date, endDate: date, days: 0, hours, startTime: seg.startTime, endTime: seg.endTime, substitute };
}

/**
 * Validate a leave request and compute its duration on the server.
 * Nothing about the duration is trusted from the client.
 * Days are working days: Saturdays, Sundays and `holidays` are not counted
 * (except Maternity, which is fixed in calendar days).
 */
export function computeLeave(
  body:     SubmittedLeave,
  today:    string,
  holidays: ReadonlySet<string> = new Set(),
): ComputedLeave {
  const type  = String(body.type ?? body.leave ?? "").toUpperCase();
  const notes = String(body.notes ?? "").slice(0, 500);
  if (!SUBMITTABLE_TYPES.includes(type)) fail("ប្រភេទច្បាប់មិនត្រឹមត្រូវ (Invalid leave type).");

  const substitute =
    typeof body.substitute === "string" && body.substitute.trim() ? body.substitute.trim() : null;

  // ── Segment mode (Annual / Sick / Personal) ───────────────────────────────
  if (FLEXIBLE_TYPES.includes(type) && Array.isArray(body.segments) && body.segments.length > 0) {
    if (body.segments.length > 31) fail("Segment ច្រើនពេក (Too many segments).");
    const segments = body.segments.map((s) => normaliseSegment(s, type, today, holidays));

    let days = 0, hours = 0;
    for (const s of segments) { days += s.days ?? 0; hours += s.hours ?? 0; }
    const total = normalise(days, hours);

    const startYmd = segments.map((s) => s.date).sort()[0];
    const endYmd   = segments.map((s) => s.endDate ?? s.date).sort().slice(-1)[0];
    if (startYmd.slice(0, 4) !== endYmd.slice(0, 4)) fail("ច្បាប់មិនអាចឆ្លងឆ្នាំបានទេ — សូមបំបែកជាពីរសំណើ (Leave cannot span two years — please split it).");

    return { type, startYmd, endYmd, ...total, segments, substitute, notes };
  }

  const startYmd = body.startDate ? toYmd(body.startDate) : "";
  if (!isValidYmd(startYmd)) fail("សូមជ្រើសរើសថ្ងៃចាប់ផ្ដើម (Start date is required).");
  checkEarliestStart(type, startYmd, today, holidays);

  // ── Maternity: fixed length from gender ───────────────────────────────────
  if (type === "MATERNITY") {
    const gender = body.maternityGender;
    if (gender !== "MALE" && gender !== "FEMALE") fail("សូមជ្រើសរើសភេទ (Please select Male or Female).");
    const days = MATERNITY_DAYS[gender];
    // Weekends (and holidays) don't count toward the entitlement — extend
    // the end date so the leave actually covers `days` working days.
    const endYmd = endDateForWorkingDays(startYmd, days, holidays);
    return {
      type, startYmd, endYmd,
      days, hours: 0, segments: null, maternityGender: gender, substitute, notes,
    };
  }

  // ── Partial-day (hourly) Annual / Sick / Personal ─────────────────────────
  const hasTimes = !!(body.startTime && body.endTime);
  if (FLEXIBLE_TYPES.includes(type) && (hasTimes || Number(body.hours) > 0)) {
    const hours = hasTimes ? workHoursBetween(body.startTime!, body.endTime!) : clampHours(body.hours);
    if (hours <= 0) fail("ម៉ោងបញ្ចប់ត្រូវតែក្រោយម៉ោងចាប់ផ្ដើម (End time must be after start time).");
    if (!isWorkingDay(startYmd, holidays)) fail(RULE_MESSAGES.nonWorkingDay);
    const full = hours >= WORK_HOURS_PER_DAY;
    return {
      type, startYmd, endYmd: startYmd,
      days: full ? 1 : 0, hours: full ? 0 : hours,
      segments: null,
      startTime: full ? undefined : body.startTime,
      endTime:   full ? undefined : body.endTime,
      substitute, notes,
    };
  }

  // ── Full-day range ────────────────────────────────────────────────────────
  const endYmd = body.endDate ? toYmd(body.endDate) : startYmd;
  if (!isValidYmd(endYmd) || endYmd < startYmd) fail("ថ្ងៃបញ្ចប់ត្រូវតែក្រោយថ្ងៃចាប់ផ្ដើម (End date must be after start date).");
  if (startYmd.slice(0, 4) !== endYmd.slice(0, 4)) fail("ច្បាប់មិនអាចឆ្លងឆ្នាំបានទេ — សូមបំបែកជាពីរសំណើ (Leave cannot span two years — please split it).");

  return {
    type, startYmd, endYmd,
    days: workingDaysOrFail(startYmd, endYmd, holidays), hours: 0,
    segments: null, substitute, notes,
  };
}

/** Earliest and latest date mentioned in a request (to load the holidays in between). */
export function requestDateBounds(body: SubmittedLeave): { from: string; to: string } | null {
  // Maternity's end date isn't known ahead of time — it depends on how many
  // weekends/holidays fall inside it — so fetch a generously wide window
  // instead of trusting whatever (stale) endDate the client happened to send.
  const type = String(body.type ?? body.leave ?? "").toUpperCase();
  if (type === "MATERNITY" && typeof body.startDate === "string" && isValidYmd(toYmd(body.startDate))) {
    const start = toYmd(body.startDate);
    return { from: start, to: addDaysYmd(start, MAX_WORKING_DAY_SPAN_DAYS) };
  }

  const dates = [
    body.startDate, body.endDate,
    ...(Array.isArray(body.segments) ? body.segments.flatMap((s) => [s?.date, s?.endDate]) : []),
  ]
    .filter((d): d is string => typeof d === "string")
    .map(toYmd)
    .filter(isValidYmd)
    .sort();
  if (dates.length === 0) return null;
  return { from: dates[0], to: dates[dates.length - 1] };
}

export function totalDays(leave: { days: number; hours?: number | null }): number {
  return toDayFraction(leave.days, Number(leave.hours ?? 0));
}

/**
 * Throws unless a sick leave over the threshold has a certificate attached —
 * or the employee chose "ជំពាក់សិន" (certificateLater) and will upload it
 * afterwards via PUT /api/leave/[leaveId]/attachment.
 */
export function checkSickCertificate(type: string, days: number, hours: number, hasAttachment: boolean, certificateLater = false) {
  if (requiresSickCertificate(type, toDayFraction(days, hours)) && !hasAttachment && !certificateLater) {
    fail(RULE_MESSAGES.sickCertificate);
  }
}

/** A sick leave over the threshold that still has no certificate. */
export function certificateOwed(leave: { type: string; days: number; hours?: number | null }, attachmentCount: number): boolean {
  return attachmentCount === 0 && requiresSickCertificate(leave.type, totalDays(leave));
}

export type UploadedFile = { name: string; type: string; bytes: Buffer };

/** Decode the `{ fileName, mimeType, base64 }` certificate carried inside a JSON body. */
export function jsonAttachment(a: SubmittedLeave["attachment"]): UploadedFile | null {
  if (!a?.base64) return null;
  return { name: String(a.fileName ?? ""), type: String(a.mimeType ?? ""), bytes: Buffer.from(a.base64, "base64") };
}

/** Does the file actually start with the signature of the type it claims to be? */
function hasValidSignature(bytes: Buffer, mimeType: string): boolean {
  const ascii = (from: number, to: number) => bytes.subarray(from, to).toString("latin1");
  switch (mimeType) {
    case "image/jpeg":      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "image/png":       return bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    case "image/webp":      return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    case "application/pdf": return ascii(0, 5) === "%PDF-";
    case "image/heic":
    case "image/heif":      return ascii(4, 8) === "ftyp";
    default:                return false;
  }
}

export async function readAttachment(file: UploadedFile | null) {
  if (!file || file.bytes.length === 0) return null;
  if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) fail(RULE_MESSAGES.attachmentType);
  if (file.bytes.length > MAX_ATTACHMENT_BYTES) fail(RULE_MESSAGES.attachmentSize);

  // Raw multipart uploads have reached the server with every non-UTF-8 byte
  // replaced by U+FFFD (EF BF BD) somewhere between the browser and this
  // handler — the stored file is then unrecoverable. Refuse anything that
  // doesn't start with its type's signature rather than store garbage.
  if (!hasValidSignature(file.bytes, file.type)) {
    fail("ឯកសារខូចពេលផ្ញើ — សូម Refresh ទំព័រ ហើយភ្ជាប់ឯកសារម្ដងទៀត (The file was damaged during upload — refresh the page and attach it again).");
  }

  let mimeType = file.type;
  let fileName = (file.name || "attachment").slice(0, 200);
  let data     = file.bytes;

  // No browser can display HEIC/HEIF inline — convert to JPEG so the
  // certificate is actually viewable once it's approved/opened later.
  if (isHeic(mimeType)) {
    data     = await heicToJpeg(data);
    mimeType = "image/jpeg";
    fileName = fileName.replace(/\.(heic|heif)$/i, "") + ".jpg";
  }

  return { fileName, mimeType, size: data.length, data };
}

// ── Telegram formatting ──────────────────────────────────────────────────────

/** Escape user-supplied text before putting it in a Telegram HTML message. */
export function escapeHtml(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function getLeaveLabel(type: string, gender?: string | null): string {
  if (type === "MATERNITY" && gender) {
    return gender === "MALE"
      ? "ច្បាប់មាតុភាព (បុរស · Paternity · 7ថ្ងៃ)"
      : "ច្បាប់មាតុភាព (ស្ត្រី · Maternity · 90ថ្ងៃ)";
  }
  const labels: Record<string, string> = {
    ANNUAL:    "ច្បាប់ឈប់សម្រាកប្រចាំឆ្នាំ",
    SICK:      "ច្បាប់ឈប់សម្រាកឈឺ",
    PERSONAL:  "ច្បាប់ឈប់សម្រាកផ្ទាល់ខ្លួន",
    MATERNITY: "ច្បាប់មាតុភាព",
    SPECIAL:   "ច្បាប់ឈប់សម្រាកពិសេស",
    SHORT:     "ច្បាប់ឈប់សម្រាករយះពេលខ្លី",
  };
  return labels[type.toUpperCase()] ?? `ច្បាប់ ${escapeHtml(type)}`;
}

export function formatTotalMinutes(totalMin: number): string {
  if (totalMin <= 0) return "0 ម៉ោង";

  const FULL_DAY = 8 * 60;
  const HALF_DAY = 4 * 60;

  const wholeDays = Math.floor(totalMin / FULL_DAY);
  const remMin    = totalMin % FULL_DAY;

  if (remMin === 0) return `${wholeDays} ថ្ងៃ`;

  if (wholeDays === 0) {
    if (remMin === HALF_DAY) return "កន្លះថ្ងៃ";
    const h = Math.floor(remMin / 60);
    const m = remMin % 60;
    if (h === 0) return `${m} នាទី`;
    if (m === 0) return `${h} ម៉ោង`;
    return `${h} ម៉ោង ${m} នាទី`;
  }

  if (remMin === HALF_DAY) return `${wholeDays} ថ្ងៃកន្លះ`;
  const h = Math.floor(remMin / 60);
  const m = remMin % 60;
  const timeStr = m === 0 ? `${h} ម៉ោង` : `${h} ម៉ោង ${m} នាទី`;
  return `${wholeDays} ថ្ងៃ ${timeStr}`;
}

export function durationLabel(days: number, hours: number): string {
  return formatTotalMinutes(Math.round((days * WORK_HOURS_PER_DAY + hours) * 60));
}

function fmtYmd(ymd: string): string {
  return format(ymdToDate(toYmd(ymd)), "dd MMM yyyy");
}

function formatSegmentLine(seg: StoredSegment): string {
  const startLabel = fmtYmd(seg.date);
  const h = seg.hours ?? 0;
  const d = seg.days  ?? 0;
  const sub = seg.substitute ? ` · 👥 ${escapeHtml(seg.substitute)}` : "";

  if (d > 1) return `  📌 ${startLabel} → ${fmtYmd(seg.endDate ?? seg.date)} · ${d} ថ្ងៃ${sub}`;
  if (d === 1 || h >= 8) return `  📌 ${startLabel} · 1 ថ្ងៃ${sub}`;

  const timeRange = seg.startTime && seg.endTime ? ` (${escapeHtml(seg.startTime)}–${escapeHtml(seg.endTime)})` : "";
  return `  📌 ${startLabel} · ${formatTotalMinutes(Math.round(h * 60))}${timeRange}${sub}`;
}

/** The date/duration lines of a Telegram message for a leave. */
export function buildDateBlock(leave: {
  startDate: Date;
  endDate:   Date;
  days:      number;
  hours?:    number | null;
  segments?: unknown;
  substitute?: string | null;
}, timeRange?: string): string[] {
  const segs = Array.isArray(leave.segments) ? (leave.segments as StoredSegment[]) : null;
  const total = durationLabel(leave.days, Number(leave.hours ?? 0));

  if (segs && segs.length > 0) {
    return [
      ``,
      `📅 <b>កាលបរិច្ឆេទ (${segs.length} segment):</b>`,
      ...segs.map(formatSegmentLine),
      ``,
      `⏱ <b>រយៈពេលសរុប៖</b> ${total}`,
    ];
  }

  const s = format(leave.startDate, "dd MMM yyyy");
  const e = format(leave.endDate,   "dd MMM yyyy");
  const range = s === e ? s : `${s} → ${e}`;
  return [
    `📅 <b>កាលបរិច្ឆេទ៖</b> ${range}`,
    `⏱ <b>រយៈពេល៖</b> ${total}${timeRange ? ` (${escapeHtml(timeRange)})` : ""}`,
    ...(leave.substitute ? [`👥 <b>អ្នកជំនួស៖</b> ${escapeHtml(leave.substitute)}`] : []),
  ];
}

/**
 * The email a user's leaves are stored under. Accounts without an email
 * (Telegram / username logins) use the same synthetic id the portal always used.
 */
export function leaveOwnerEmail(user: { email: string | null; telegramId?: string | null; id: string }): string {
  return user.email ?? (user.telegramId ? `telegram-${user.telegramId}` : `userid-${user.id}`);
}

export function appBaseUrl(): string {
  return (process.env.NEXTAUTH_URL ?? "https://system.camprotec.com.kh").replace(/\/$/, "");
}

export function leaveUrl(id: string): string {
  return `${appBaseUrl()}/dashboard/leaves/${id}`;
}

export function attachmentPath(leaveId: string, attachmentId: string): string {
  return `/api/leave/${leaveId}/attachment/${attachmentId}`;
}

/**
 * Telegram buttons that open a leave's medical certificate(s). The link goes
 * through the app, so only the employee and admins/moderators can open it
 * (others are asked to log in / get "Forbidden").
 */
export function certificateButtons(leaveId: string, attachmentIds: string[]): { text: string; url: string }[] {
  return attachmentIds.map((id, i) => ({
    text: attachmentIds.length > 1 ? `📎 មើលសំបុត្រពេទ្យ (${i + 1})` : "📎 មើលសំបុត្រពេទ្យ",
    url:  `${appBaseUrl()}${attachmentPath(leaveId, id)}`,
  }));
}

export const CERTIFICATE_LINE = `📎 <b>សំបុត្រពេទ្យ៖</b> មានភ្ជាប់ — ចុចប៊ូតុង «មើលសំបុត្រពេទ្យ» ខាងក្រោម`;
export const CERTIFICATE_OWED_LINE = `📎 <b>សំបុត្រពេទ្យ៖</b> ⏳ ជំពាក់សិន — អ្នកស្នើនឹងភ្ជាប់ពេលក្រោយ`;

/** The certificate line for a Telegram message: attached, owed, or none needed. */
export function certificateLines(leave: { type: string; days: number; hours?: number | null }, attachmentCount: number): string[] {
  if (attachmentCount > 0) return [CERTIFICATE_LINE];
  return certificateOwed(leave, attachmentCount) ? [CERTIFICATE_OWED_LINE] : [];
}

/**
 * One-click Approve/Reject buttons for the Telegram message. Tapping one
 * calls app/api/telegram/webhook/route.ts, which runs the exact same
 * decideLeave() as the web page — the tapper's Telegram account must be
 * linked (telegramId) to an ADMIN/MODERATOR user, and department scoping
 * still applies; anyone else just gets a private "not permitted" popup.
 */
export function actionButtons(leaveId: string): { text: string; callback_data: string }[] {
  return [
    { text: "✅ អនុម័ត (Approve)", callback_data: `approve:${leaveId}` },
    { text: "❌ បដិសេធ (Reject)",  callback_data: `reject:${leaveId}` },
  ];
}
