// app/api/leave/export/[email]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser }            from "@/lib/session";
import prisma                        from "@/lib/prisma";
import { readFile }                  from "fs/promises";
import path                          from "path";
import ExcelJS                       from "exceljs";

type Params = { params: { email: string } };

// ── KH digits ────────────────────────────────────────────────────────────────
const KH: Record<string, string> = {
  "0":"០","1":"១","2":"២","3":"៣","4":"៤",
  "5":"៥","6":"៦","7":"៧","8":"៨","9":"៩",
};
const kh = (n: number) => String(Math.round(n)).replace(/[0-9]/g, d => KH[d]);

// ── Convert a 4-digit year string like "2026" → "២០២៦" ──────────────────────
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
  applied:              string;
  start:                string;
  end:                  string;
  dur:                  string;
  balance:              string;
  note:                 string;
  headDeptApproved:     boolean;
  managerApproved:      boolean;
};

// ── Column helpers ────────────────────────────────────────────────────────────
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
  return {
    left:  colNum(m[1]),
    top:   parseInt(m[2], 10),
    right: colNum(m[3]),
    bottom: parseInt(m[4], 10),
    raw,
  };
}

function cloneRowAfter(
  ws: ExcelJS.Worksheet,
  srcRowNum: number,
  count: number,
) {
  if (count <= 0) return;

  const srcRow    = ws.getRow(srcRowNum);
  const srcHeight = (srcRow.height as number) ?? 20;

  const cellSnapshots: Array<{ col: number; style: ExcelJS.Style; value: ExcelJS.CellValue }> = [];
  srcRow.eachCell({ includeEmpty: true }, (cell, col) => {
    cellSnapshots.push({
      col,
      style: JSON.parse(JSON.stringify(cell.style)),
      value: cell.value,
    });
  });

  const mergeModel = (ws as any).model?.merges as string[] | undefined;

  interface MergeInfo { left: number; right: number; rowSpan: number }
  const srcMerges: MergeInfo[] = [];
  const belowMerges: MergeRange[] = [];

  if (mergeModel) {
    for (const raw of mergeModel) {
      const mg = parseMerge(raw);
      if (!mg) continue;
      if (mg.top === srcRowNum) {
        srcMerges.push({ left: mg.left, right: mg.right, rowSpan: mg.bottom - mg.top });
      } else if (mg.top > srcRowNum) {
        belowMerges.push(mg);
      }
    }
  }

  for (const bm of belowMerges) {
    try { ws.unMergeCells(bm.raw); } catch { /* already unmerged, ignore */ }
  }

  ws.spliceRows(srcRowNum + 1, 0, ...Array(count).fill([]));

  for (let i = 0; i < count; i++) {
    const dstRowNum = srcRowNum + 1 + i;
    const dstRow    = ws.getRow(dstRowNum);
    dstRow.height   = srcHeight;

    for (const snap of cellSnapshots) {
      const dstCell = dstRow.getCell(snap.col);
      dstCell.style = JSON.parse(JSON.stringify(snap.style));
      dstCell.value = null;
    }

    for (const mg of srcMerges) {
      const tl = `${colLetter(mg.left)}${dstRowNum}`;
      const br = `${colLetter(mg.right)}${dstRowNum + mg.rowSpan}`;
      try { ws.mergeCells(`${tl}:${br}`); } catch { /* skip duplicates */ }
    }

    dstRow.commit();
  }

  for (const bm of belowMerges) {
    const newTop    = bm.top    + count;
    const newBottom = bm.bottom + count;
    const tl = `${colLetter(bm.left)}${newTop}`;
    const br = `${colLetter(bm.right)}${newBottom}`;
    try { ws.mergeCells(`${tl}:${br}`); } catch { /* skip duplicates */ }
  }
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
  const segments = text.split("\n");
  let totalLines = 0;
  for (const seg of segments) {
    totalLines += Math.max(1, Math.ceil(seg.length / charsPerLine));
  }
  return totalLines;
}

// ── Approval cell style helper ────────────────────────────────────────────────
function applyApprovalStyle(cell: ExcelJS.Cell) {
  cell.font      = { ...cell.font, size: 10 };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
}

// ── Write data into one row ───────────────────────────────────────────────────
function writeRow(
  ws: ExcelJS.Worksheet,
  rowNum: number,
  lv: LeaveRow,
) {
  const r = ws.getRow(rowNum);
  r.eachCell({ includeEmpty: true }, c => { c.value = null; });

  // ── Columns A–F : existing data ──────────────────────────────────────────
  r.getCell(1).value = lv.applied;   // A – Date Applied
  r.getCell(2).value = lv.start;     // B – Start Date
  r.getCell(3).value = lv.end;       // C – End Date
  r.getCell(4).value = lv.dur;       // D – Duration
  r.getCell(5).value = lv.balance;   // E – Balance
  r.getCell(6).value = lv.note;      // F – Note / Reason

  // ── Column G : always "បានស្នើរ" (submitted) ─────────────────────────────
  r.getCell(7).value = "បានស្នើរ";
  r.getCell(7).font      = { ...r.getCell(7).font, size: 10 };
  r.getCell(7).alignment = { horizontal: "center", vertical: "middle", wrapText: true };

  // ── Column J : Head Department approval ──────────────────────────────────
  r.getCell(10).value = lv.headDeptApproved ? "បានអនុម័ត" : "";
  applyApprovalStyle(r.getCell(10));

  // ── Column K : HR / Manager (Admin) approval ─────────────────────────────
  r.getCell(11).value = lv.managerApproved ? "បានអនុម័ត" : "";
  applyApprovalStyle(r.getCell(11));

  // ── Base font + wrap for A–F ─────────────────────────────────────────────
  for (let c = 1; c <= 6; c++) {
    const cell = r.getCell(c);
    cell.font      = { ...cell.font, size: 10 };
    cell.alignment = { ...cell.alignment, wrapText: true };
  }

  // ── Row height driven by note column ────────────────────────────────────
  const noteColWidth = (ws.getColumn(6).width as number) ?? 20;
  const lines        = estimateWrappedLines(lv.note, noteColWidth);
  const neededHeight = lines * LINE_HEIGHT_PX + ROW_PADDING_PX;
  r.height = Math.max(MIN_ROW_HEIGHT, neededHeight);

  r.commit();
}

// ── Route ─────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: Params) {
  const loggedInUser = await getCurrentUser();
  if (!loggedInUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const email = decodeURIComponent(params.email);
  const year  = req.nextUrl.searchParams.get("year") ?? new Date().getFullYear().toString();

  if (
    loggedInUser.email !== email &&
    loggedInUser.role  !== "ADMIN" &&
    loggedInUser.role  !== "MODERATOR"
  ) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const [leaves, balance, userRecord] = await Promise.all([
    prisma.leave.findMany({
      where: { userEmail: email, year, status: "APPROVED" },
      orderBy: { startDate: "asc" },
    }),
    prisma.balances.findFirst({ where: { email, year } }),
    prisma.user.findUnique({ where: { email } }),
  ]);

  const userName = userRecord?.name ?? leaves[0]?.userName ?? email;
  const userPos  = (userRecord as any)?.position   ?? "";
  const userDept = (userRecord as any)?.department ?? "";

  const annualCredit = Number(balance?.annualCredit ?? 0);
  const sickCredit   = Number(balance?.sickCredit   ?? 0);

  // ── Build sections ──────────────────────────────────────────────────────────
  let annualBal = annualCredit;
  const sec1: LeaveRow[] = leaves
    .filter(l => ["ANNUAL","PERSONAL"].includes(l.type))
    .map(lv => {
      const d = Number(lv.days ?? 0), h = Number(lv.hours ?? 0);
      annualBal -= d;
      return {
        applied:          fmtDate(lv.createdAt),
        start:            fmtDate(lv.startDate),
        end:              fmtDate(lv.endDate ?? lv.startDate),
        dur:              durLabel(d, h),
        balance:          `${kh(Math.max(0, annualBal))} ថ្ងៃ`,
        note:             lv.userNote ?? "",
        headDeptApproved: lv.headDepartmentApproved === true,
        managerApproved:  lv.managerApproved === true,
      };
    });

  let sickBal = sickCredit;
  const sec2: LeaveRow[] = leaves
    .filter(l => l.type === "SICK")
    .map(lv => {
      const d = Number(lv.days ?? 0), h = Number(lv.hours ?? 0);
      sickBal -= d;
      return {
        applied:          fmtDate(lv.createdAt),
        start:            fmtDate(lv.startDate),
        end:              fmtDate(lv.endDate ?? lv.startDate),
        dur:              durLabel(d, h),
        balance:          `${kh(Math.max(0, sickBal))} ថ្ងៃ`,
        note:             lv.userNote ?? "",
        headDeptApproved: lv.headDepartmentApproved === true,
        managerApproved:  lv.managerApproved === true,
      };
    });

  const sec3: LeaveRow[] = leaves
    .filter(l => ["SPECIAL","MATERNITY"].includes(l.type))
    .map(lv => {
      const d = Number(lv.days ?? 0), h = Number(lv.hours ?? 0);
      return {
        applied:          fmtDate(lv.createdAt),
        start:            fmtDate(lv.startDate),
        end:              fmtDate(lv.endDate ?? lv.startDate),
        dur:              durLabel(d, h),
        balance:          "០ ថ្ងៃ",
        note:             lv.userNote ?? "",
        headDeptApproved: lv.headDepartmentApproved === true,
        managerApproved:  lv.managerApproved === true,
      };
    });

  // ── Load template ───────────────────────────────────────────────────────────
  const tmplPath = path.join(process.cwd(), "public", "templates", "leave-card.xlsx");
  let buf: Buffer;
  try { buf = await readFile(tmplPath); }
  catch {
    return NextResponse.json({ error: "Template not found" }, { status: 500 });
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const ws = wb.worksheets[0];

  // ── Widen col F (note / reason / illness) ───────────────────────────────────
  const noteColumn = ws.getColumn(6);
  if (!noteColumn.width || noteColumn.width < 30) {
    noteColumn.width = 30;
  }

  // ── Header ──────────────────────────────────────────────────────────────────
  ws.getCell("A6").value  = `ប័ណ្ណសុំច្បាប់របស់បុគ្គលិក ឆ្នាំ(${khYear(year)})`;
  ws.getCell("A7").value  = `ឈ្មោះបុគ្គលិក៖  ${userName}`;
  ws.getCell("A8").value  = `តួនាទី៖  ${userPos}`;
  ws.getCell("A9").value  = `ផ្នែក/សាខា  ${userDept}`;
  ws.getCell("A11").value = `ច្បាប់ឈប់សម្រាកប្រចាំឆ្នាំរយៈពេល ${kh(annualCredit)} ថ្ងៃ`;

  // ── Template data row positions ─────────────────────────────────────────────
  const ANNUAL_SLOTS  = 5;
  const SICK_SLOTS    = 5;
  const SPECIAL_SLOTS = 5;

  let R1 = 15, R2 = 26, R3 = 36;

  // ── Section 1: annual ───────────────────────────────────────────────────────
  const extra1 = Math.max(0, sec1.length - ANNUAL_SLOTS);
  if (extra1 > 0) {
    cloneRowAfter(ws, R1 + ANNUAL_SLOTS - 1, extra1);
    R2 += extra1;
    R3 += extra1;
  }
  for (let i = 0; i < Math.max(sec1.length, 1); i++) {
    if (sec1[i]) writeRow(ws, R1 + i, sec1[i]);
  }

  // ── Section 2: sick ─────────────────────────────────────────────────────────
  const extra2 = Math.max(0, sec2.length - SICK_SLOTS);
  if (extra2 > 0) {
    cloneRowAfter(ws, R2 + SICK_SLOTS - 1, extra2);
    R3 += extra2;
  }
  for (let i = 0; i < Math.max(sec2.length, 1); i++) {
    if (sec2[i]) writeRow(ws, R2 + i, sec2[i]);
  }

  // ── Section 3: special ──────────────────────────────────────────────────────
  const extra3 = Math.max(0, sec3.length - SPECIAL_SLOTS);
  if (extra3 > 0) cloneRowAfter(ws, R3 + SPECIAL_SLOTS - 1, extra3);
  for (let i = 0; i < Math.max(sec3.length, 1); i++) {
    if (sec3[i]) writeRow(ws, R3 + i, sec3[i]);
  }

  // ── Output ──────────────────────────────────────────────────────────────────
  const outBuf   = await wb.xlsx.writeBuffer();
  const safeYear = year.replace(/\D/g, "");

  const asciiName = userName.replace(/[^\x20-\x7E]/g, "").trim().replace(/\s+/g, "_") || "leave-card";
  const fallbackFilename = `leave-card-${asciiName}-${safeYear}.xlsx`;
  const utf8Filename = encodeURIComponent(`leave-card-${userName}-${safeYear}.xlsx`);

  return new NextResponse(new Uint8Array(outBuf as ArrayBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${utf8Filename}`,
    },
  });
}
