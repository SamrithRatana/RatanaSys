// Builds the employee leave card (ប័ណ្ណសុំច្បាប់) Excel from
// public/templates/leave-card.xlsx. Used by app/api/leave/export/[email].
//
// The template has three sections — annual, sick, special — each with a
// title/header and 5 data rows. Personal and maternity/paternity get their
// own sections too: they're built by copying the template's own title,
// header and data rows, so every leave type has its own topic and its own
// running "នៅសល់" (remaining) column.

import ExcelJS from "exceljs";
import { leaveDayTotal } from "@/lib/leaveRules";

// ── KH digits ────────────────────────────────────────────────────────────────
const KH: Record<string, string> = {
  "0":"០","1":"១","2":"២","3":"៣","4":"៤",
  "5":"៥","6":"៦","7":"៧","8":"៨","9":"៩",
};
// Keeps half-days etc. (17.5 → ១៧.៥) instead of rounding them away
const kh = (n: number) => String(Math.round(n * 100) / 100).replace(/[0-9]/g, d => KH[d]);

function khYear(y: string): string {
  return y.replace(/[0-9]/g, d => KH[d]);
}

function fmtDate(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d.split("T")[0] + "T12:00:00Z") : d;
  return `${String(dt.getUTCDate()).padStart(2,"0")}/${String(dt.getUTCMonth()+1).padStart(2,"0")}/${dt.getUTCFullYear()}`;
}

function durLabel(days: number, hours: number): string {
  const d = Math.round(days  ?? 0);
  const h = Number(hours ?? 0);
  if (d > 0 && h > 0) {
    const m = Math.round(h * 60);
    return m >= 60 ? `${kh(d)}ថ្ងៃ ${kh(m/60)}ម៉ោង` : `${kh(d)}ថ្ងៃ ${kh(m)}នាទី`;
  }
  if (d > 0) return `${kh(d)} ថ្ងៃ`;
  if (h > 0) {
    const m = Math.round(h * 60);
    if (m < 60)       return `${kh(m)} នាទី`;
    if (m % 60 === 0) return `${kh(m / 60)} ម៉ោង`;
    return `${kh(Math.floor(m / 60))} ម៉ោង ${kh(m % 60)} នាទី`;
  }
  return "—";
}

type LeaveRow = {
  applied:          string;
  start:            string;
  end:              string;
  dur:              string;
  balance:          string;
  note:             string;
  substitute:       string;   // អ្នកជំនួស
  headDeptApproved: boolean;
  managerApproved:  boolean;
};

// ── Column / merge helpers ────────────────────────────────────────────────────
function colNum(letters: string): number {
  let n = 0;
  for (let i = 0; i < letters.length; i++)
    n = n * 26 + letters.charCodeAt(i) - 64;
  return n;
}
function colLetter(num: number): string {
  let s = "";
  while (num > 0) { const r = (num - 1) % 26; s = String.fromCharCode(65 + r) + s; num = Math.floor((num - 1) / 26); }
  return s;
}

interface MergeRange { left: number; top: number; right: number; bottom: number; raw: string }

function parseMerge(raw: string): MergeRange | null {
  const m = raw.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!m) return null;
  return { left: colNum(m[1]), top: parseInt(m[2], 10), right: colNum(m[3]), bottom: parseInt(m[4], 10), raw };
}

function merges(ws: ExcelJS.Worksheet): MergeRange[] {
  const model = (ws as any).model?.merges as string[] | undefined;
  return (model ?? []).map(parseMerge).filter((m): m is MergeRange => !!m);
}

function mergeRange(ws: ExcelJS.Worksheet, left: number, top: number, right: number, bottom: number) {
  try { ws.mergeCells(`${colLetter(left)}${top}:${colLetter(right)}${bottom}`); } catch { /* overlap/duplicate — skip */ }
}

/**
 * Insert `count` blank rows before row `at`, moving every merge at or
 * below it down with the rows (ExcelJS's spliceRows doesn't move merges).
 */
function insertRows(ws: ExcelJS.Worksheet, at: number, count: number) {
  if (count <= 0) return;
  const below = merges(ws).filter((m) => m.top >= at);
  for (const m of below) { try { ws.unMergeCells(m.raw); } catch { /* ignore */ } }
  ws.spliceRows(at, 0, ...Array(count).fill([]));
  for (const m of below) mergeRange(ws, m.left, m.top + count, m.right, m.bottom + count);
}

// ── Row-block snapshots (copy template rows to build new sections) ───────────
type RowSnap   = { height?: number; cells: { col: number; style: ExcelJS.Style; value: ExcelJS.CellValue }[] };
type BlockSnap = { rows: RowSnap[]; merges: { left: number; right: number; top: number; bottom: number }[] };

/** Styles, values, heights and inner merges of rows from..to (inclusive). */
function snapshotRows(ws: ExcelJS.Worksheet, from: number, to: number): BlockSnap {
  const rows: RowSnap[] = [];
  for (let r = from; r <= to; r++) {
    const row = ws.getRow(r);
    const cells: RowSnap["cells"] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cells.push({ col, style: JSON.parse(JSON.stringify(cell.style)), value: cell.value });
    });
    rows.push({ height: row.height as number | undefined, cells });
  }
  const inner = merges(ws)
    .filter((m) => m.top >= from && m.bottom <= to)
    .map((m) => ({ left: m.left, right: m.right, top: m.top - from, bottom: m.bottom - from }));
  return { rows, merges: inner };
}

/** Paint a snapshot at row `at` (rows must already exist/be blank). */
function paintBlock(ws: ExcelJS.Worksheet, at: number, snap: BlockSnap, repeat = 1) {
  const h = snap.rows.length;
  for (let k = 0; k < repeat; k++) {
    const base = at + k * h;
    snap.rows.forEach((rs, i) => {
      const row = ws.getRow(base + i);
      if (rs.height) row.height = rs.height;
      for (const c of rs.cells) {
        const cell = row.getCell(c.col);
        cell.style = JSON.parse(JSON.stringify(c.style));
        cell.value = c.value;
      }
      row.commit();
    });
    for (const m of snap.merges) mergeRange(ws, m.left, base + m.top, m.right, base + m.bottom);
  }
}

/** Clone the formatting of `srcRowNum` into `count` new rows right below it. */
function cloneRowAfter(ws: ExcelJS.Worksheet, srcRowNum: number, count: number) {
  if (count <= 0) return;
  const snap = snapshotRows(ws, srcRowNum, srcRowNum);
  snap.rows[0].cells.forEach((c) => { c.value = null; });
  insertRows(ws, srcRowNum + 1, count);
  paintBlock(ws, srcRowNum + 1, snap, count);
}

// ── Text wrapping helpers ─────────────────────────────────────────────────────
const KHMER_CHAR_WIDTH_PX = 8.4;
const COLUMN_WIDTH_TO_PX  = 7;
const LINE_HEIGHT_PX      = 20;
const ROW_PADDING_PX      = 6;
const WRAP_SAFETY_MARGIN  = 0.92;
const MIN_ROW_HEIGHT      = 32.25;

function estimateWrappedLines(text: string, colWidthChars: number): number {
  if (!text) return 1;
  const colWidthPx = colWidthChars * COLUMN_WIDTH_TO_PX * WRAP_SAFETY_MARGIN;
  const charsPerLine = Math.max(1, Math.floor(colWidthPx / KHMER_CHAR_WIDTH_PX));
  let totalLines = 0;
  for (const seg of text.split("\n")) totalLines += Math.max(1, Math.ceil(seg.length / charsPerLine));
  return totalLines;
}

function applyApprovalStyle(cell: ExcelJS.Cell) {
  cell.font      = { ...cell.font, size: 10 };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
}

// ── Write data into one row ───────────────────────────────────────────────────
function writeRow(ws: ExcelJS.Worksheet, rowNum: number, lv: LeaveRow) {
  const r = ws.getRow(rowNum);
  r.eachCell({ includeEmpty: true }, c => { c.value = null; });

  r.getCell(1).value = lv.applied;   // A – Date Applied
  r.getCell(2).value = lv.start;     // B – Start Date
  r.getCell(3).value = lv.end;       // C – End Date
  r.getCell(4).value = lv.dur;       // D – Duration
  r.getCell(5).value = lv.balance;   // E – Balance
  r.getCell(6).value = lv.note;      // F – Note / Reason

  // G : always "បានស្នើរ" (submitted)
  r.getCell(7).value = "បានស្នើរ";
  r.getCell(7).font      = { ...r.getCell(7).font, size: 10 };
  r.getCell(7).alignment = { horizontal: "center", vertical: "middle", wrapText: true };

  // H : substitute name (អ្នកជំនួស); I : "បានចាត់តាំង" when there is one
  if (lv.substitute) {
    r.getCell(8).value = lv.substitute;
    r.getCell(8).font      = { ...r.getCell(8).font, size: 10 };
    r.getCell(8).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    r.getCell(9).value = "បានចាត់តាំង";
    r.getCell(9).font      = { ...r.getCell(9).font, size: 10 };
    r.getCell(9).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  }

  // J : head of department approval; K : HR / manager approval
  r.getCell(10).value = lv.headDeptApproved ? "បានអនុម័ត" : "";
  applyApprovalStyle(r.getCell(10));
  r.getCell(11).value = lv.managerApproved ? "បានអនុម័ត" : "";
  applyApprovalStyle(r.getCell(11));

  for (let c = 1; c <= 6; c++) {
    const cell = r.getCell(c);
    cell.font      = { ...cell.font, size: 10 };
    cell.alignment = { ...cell.alignment, wrapText: true };
  }

  // Row height driven by the note column
  const noteColWidth = (ws.getColumn(6).width as number) ?? 20;
  const lines        = estimateWrappedLines(lv.note, noteColWidth);
  r.height = Math.max(MIN_ROW_HEIGHT, lines * LINE_HEIGHT_PX + ROW_PADDING_PX);

  r.commit();
}

// ── Public API ────────────────────────────────────────────────────────────────
export type LeaveCardLeave = {
  type:                    string;
  createdAt:               Date;
  startDate:               Date;
  endDate:                 Date | null;
  days:                    number;
  hours:                   number | null;
  userNote:                string | null;
  substitute:              string | null;
  segments:                unknown;
  headDepartmentApproved:  boolean | null;
  managerApproved:         boolean | null;
};

export type LeaveCardInput = {
  template: Buffer;
  year:     string;
  userName: string;
  userPos:  string;
  userDept: string;
  balance: {
    annualCredit?:    number | null;
    personalCredit?:  number | null;
    sickCredit?:      number | null;
    specialCredit?:   number | null;
    maternityCredit?: number | null;
  } | null;
  leaves: LeaveCardLeave[];   // not rejected, sorted by start date
};

// Template layout (sheet 1): section start rows and data slots
const T = {
  annualHeader:  [12, 14], annualData: 15,
  sickTitle:     20,       sickData:   26,
  specialTitle:  31,       specialHeader: [33, 35], specialData: 36,
  end:           40,
  slots:         5,
} as const;

export async function buildLeaveCard(input: LeaveCardInput): Promise<Buffer> {
  const { balance, leaves, year } = input;

  const credit = {
    annual:    Number(balance?.annualCredit    ?? 0),
    personal:  Number(balance?.personalCredit  ?? 0),
    sick:      Number(balance?.sickCredit      ?? 0),
    special:   Number(balance?.specialCredit   ?? 0),
    maternity: Number(balance?.maternityCredit ?? 0),
  };
  // Running balance per credit. Only leaves that were actually deducted
  // (approved by head dept or admin) reduce it; hours count as a fraction of a day.
  const running: Record<string, number> = { ...credit };
  const CREDIT_OF: Record<string, keyof typeof credit> = {
    ANNUAL: "annual", PERSONAL: "personal", SHORT: "personal",
    SICK: "sick", SPECIAL: "special", MATERNITY: "maternity",
  };

  const toRow = (lv: LeaveCardLeave): LeaveRow => {
    const key = CREDIT_OF[lv.type] ?? "annual";
    if (lv.headDepartmentApproved === true || lv.managerApproved === true) {
      running[key] -= leaveDayTotal(lv.days, lv.hours);
    }
    // Legacy hourly rows stored 8h+ as days=1 AND hours=8 — show them as 1 day
    const d = Number(lv.days ?? 0);
    const h = d >= 1 && Number(lv.hours ?? 0) >= 8 ? 0 : Number(lv.hours ?? 0);

    // Segment leaves keep one substitute per segment
    const segs = Array.isArray(lv.segments) ? (lv.segments as { substitute?: string | null }[]) : [];
    const substitute = [lv.substitute, ...segs.map((s) => s?.substitute)]
      .filter((x, i, all): x is string => !!x && all.indexOf(x) === i).join(", ");

    return {
      applied:          fmtDate(lv.createdAt),
      start:            fmtDate(lv.startDate),
      end:              fmtDate(lv.endDate ?? lv.startDate),
      dur:              durLabel(d, h),
      balance:          `${kh(Math.max(0, running[key]))} ថ្ងៃ`,
      note:             lv.userNote ?? "",
      substitute,
      headDeptApproved: lv.headDepartmentApproved === true,
      managerApproved:  lv.managerApproved === true,
    };
  };
  const rowsOf = (...types: string[]) => leaves.filter((l) => types.includes(l.type)).map(toRow);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(input.template as any);
  const ws = wb.worksheets[0];
  // The template's second sheet is an old blank 2024 copy — don't ship it
  for (const extra of wb.worksheets.slice(1)) wb.removeWorksheet(extra.id);

  const noteColumn = ws.getColumn(6);
  if (!noteColumn.width || noteColumn.width < 30) noteColumn.width = 30;

  // ── Header ──────────────────────────────────────────────────────────────────
  ws.getCell("A6").value  = `ប័ណ្ណសុំច្បាប់របស់បុគ្គលិក ឆ្នាំ(${khYear(year)})`;
  ws.getCell("A7").value  = `ឈ្មោះបុគ្គលិក៖  ${input.userName}`;
  ws.getCell("A8").value  = `តួនាទី៖  ${input.userPos}`;
  ws.getCell("A9").value  = `ផ្នែក/សាខា  ${input.userDept}`;
  ws.getCell("A11").value = `ច្បាប់ឈប់សម្រាកប្រចាំឆ្នាំរយៈពេល ${kh(credit.annual)} ថ្ងៃ`;

  // ── Snapshot template pieces before moving anything ─────────────────────────
  const titleSnap          = snapshotRows(ws, T.sickTitle, T.sickTitle);
  const annualHeaderSnap   = snapshotRows(ws, T.annualHeader[0], T.annualHeader[1]);
  const annualDataSnap     = snapshotRows(ws, T.annualData, T.annualData);
  const specialHeaderSnap  = snapshotRows(ws, T.specialHeader[0], T.specialHeader[1]);
  const specialDataSnap    = snapshotRows(ws, T.specialData, T.specialData);
  const withTitle = (snap: BlockSnap, text: string): BlockSnap => ({
    ...snap,
    rows: snap.rows.map((r) => ({ ...r, cells: r.cells.map((c) => ({ ...c, value: text })) })),
  });

  // ── Maternity / paternity section: appended after the special section ──────
  const matTitle = `ច្បាប់មាតុភាព / បិតុភាព${credit.maternity > 0 ? ` (រយៈពេល ${kh(credit.maternity)} ថ្ងៃ)` : ""}`;
  let at = T.end + 1;
  paintBlock(ws, at, withTitle(titleSnap, matTitle));
  paintBlock(ws, at + 1, specialHeaderSnap);
  paintBlock(ws, at + 4, specialDataSnap, T.slots);
  for (let i = 0; i < T.slots; i++) ws.getRow(at + 4 + i).eachCell({ includeEmpty: true }, (c) => { c.value = null; });

  // ── Personal section: inserted between annual and sick ─────────────────────
  const PERSONAL_ROWS = 1 + 3 + T.slots;
  const personalAt    = T.sickTitle;
  insertRows(ws, personalAt, PERSONAL_ROWS);
  paintBlock(ws, personalAt, withTitle(titleSnap, `ច្បាប់ឈប់សម្រាកផ្ទាល់ខ្លួន (រយៈពេល ${kh(credit.personal)} ថ្ងៃ)`));
  paintBlock(ws, personalAt + 1, annualHeaderSnap);
  paintBlock(ws, personalAt + 4, annualDataSnap, T.slots);
  for (let i = 0; i < T.slots; i++) ws.getRow(personalAt + 4 + i).eachCell({ includeEmpty: true }, (c) => { c.value = null; });

  // ── Fill sections top to bottom; a section with more than 5 leaves grows
  //    and pushes everything below it down ────────────────────────────────────
  const sections: { dataStart: number; rows: LeaveRow[] }[] = [
    { dataStart: T.annualData,                       rows: rowsOf("ANNUAL") },
    { dataStart: personalAt + 4,                     rows: rowsOf("PERSONAL", "SHORT") },
    { dataStart: T.sickData + PERSONAL_ROWS,         rows: rowsOf("SICK") },
    { dataStart: T.specialData + PERSONAL_ROWS,      rows: rowsOf("SPECIAL") },
    { dataStart: T.end + 1 + 4 + PERSONAL_ROWS,      rows: rowsOf("MATERNITY") },
  ];
  let shift = 0;
  for (const s of sections) {
    const start = s.dataStart + shift;
    const extra = Math.max(0, s.rows.length - T.slots);
    if (extra > 0) {
      cloneRowAfter(ws, start + T.slots - 1, extra);
      shift += extra;
    }
    s.rows.forEach((row, i) => writeRow(ws, start + i, row));
  }

  // Print everything, not just the template's original A1:K40
  ws.pageSetup.printArea = `A1:K${ws.rowCount}`;

  return Buffer.from(await wb.xlsx.writeBuffer());
}
