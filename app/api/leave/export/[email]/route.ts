// app/api/leave/export/[email]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { readFile } from "fs/promises";
import path from "path";
import ExcelJS from "exceljs";

type Params = { params: { email: string } };

// ── Helpers ────────────────────────────────────────────────────────────────────
const KH: Record<string, string> = {
  "0":"០","1":"១","2":"២","3":"៣","4":"៤",
  "5":"៥","6":"៦","7":"៧","8":"៨","9":"៩",
};
const kh = (n: number) => String(Math.round(n)).replace(/[0-9]/g, d => KH[d]);

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
    if (m < 60)  return `${kh(m)} នាទី`;
    if (m % 60 === 0) return `${kh(m/60)} ម៉ោង`;
    return `${kh(Math.floor(m/60))} ម៉ោង ${kh(m%60)} នាទី`;
  }
  return "—";
}

// ── Parse merged cells that belong to a given row ─────────────────────────────
// Returns an array of {top,left,bottom,right} for every merge that starts on srcRowNum
function getMergesForRow(ws: ExcelJS.Worksheet, srcRowNum: number): Array<{
  top: number; left: number; bottom: number; right: number;
}> {
  const result: Array<{ top: number; left: number; bottom: number; right: number }> = [];
  // ExcelJS stores merges in the internal model
  const model = (ws as any).model;
  if (!model?.merges) return result;
  for (const mergeStr of model.merges as string[]) {
    // format: "A15:E15" or "A15:A17" etc.
    const match = mergeStr.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!match) continue;
    const top  = parseInt(match[2], 10);
    const bottom = parseInt(match[4], 10);
    if (top === srcRowNum) {
      const left  = colLetterToNum(match[1]);
      const right = colLetterToNum(match[3]);
      result.push({ top, left, bottom: bottom - top + srcRowNum, right });
    }
  }
  return result;
}

function colLetterToNum(letters: string): number {
  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + letters.charCodeAt(i) - 64;
  }
  return col;
}

function numToColLetter(num: number): string {
  let col = "";
  while (num > 0) {
    const rem = (num - 1) % 26;
    col = String.fromCharCode(65 + rem) + col;
    num = Math.floor((num - 1) / 26);
  }
  return col;
}

// ── Copy style AND merges from template row to a destination row ──────────────
function copyRowStyleAndMerges(
  ws: ExcelJS.Worksheet,
  srcRowNum: number,
  dstRowNum: number,
) {
  const srcRow = ws.getRow(srcRowNum);
  const dstRow = ws.getRow(dstRowNum);
  dstRow.height = srcRow.height ?? 31.35;

  // Copy cell styles
  srcRow.eachCell({ includeEmpty: true }, (srcCell, colNum) => {
    const dstCell = dstRow.getCell(colNum);
    dstCell.style = JSON.parse(JSON.stringify(srcCell.style));
  });

  // Re-apply merged regions that were on the template row, shifted to dstRowNum
  const merges = getMergesForRow(ws, srcRowNum);
  for (const m of merges) {
    const offset = dstRowNum - srcRowNum;
    const topLeft     = `${numToColLetter(m.left)}${m.top + offset}`;
    const bottomRight = `${numToColLetter(m.right)}${m.bottom + offset}`;
    try {
      ws.mergeCells(`${topLeft}:${bottomRight}`);
    } catch {
      // Already merged or invalid — skip
    }
  }

  dstRow.commit();
}

// ── Insert blank rows after a given row, copy style+merges from template row ──
function insertDataRows(
  ws: ExcelJS.Worksheet,
  afterRow: number,
  count: number,
  styleFromRow: number,
) {
  if (count <= 0) return;
  ws.spliceRows(afterRow + 1, 0, ...Array(count).fill([]));
  for (let i = 0; i < count; i++) {
    copyRowStyleAndMerges(ws, styleFromRow, afterRow + 1 + i);
  }
}

// ── Write a single data row ───────────────────────────────────────────────────
// Uses the SAME column layout as the template (col A–E for dates/duration/balance,
// col F for annual/personal/special note, col G for sick note).
function writeDataRow(
  ws: ExcelJS.Worksheet,
  row: number,
  applied: string,
  start:   string,
  end:     string,
  days:    number,
  hours:   number,
  balance: number,
  note:    string,
  isSick = false,
) {
  const r = ws.getRow(row);
  // Clear all cells first to avoid stale merged-cell ghost values
  r.eachCell({ includeEmpty: true }, (cell) => { cell.value = null; });

  r.getCell(1).value = applied;          // A - Date applied
  r.getCell(2).value = start;            // B - Start date
  r.getCell(3).value = end;              // C - End date
  r.getCell(4).value = durLabel(days, hours); // D - Duration
  r.getCell(5).value = kh(Math.max(0, balance)); // E - Balance remaining
  // F = annual/personal/special note | G = sick note
  if (isSick) {
    r.getCell(7).value = note;
  } else {
    r.getCell(6).value = note;
  }
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

  // ── Fetch data ──────────────────────────────────────────────────────────────
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

  // Section buckets
  const sec1 = leaves.filter(l => ["ANNUAL","PERSONAL","SHORT"].includes(l.type));
  const sec2 = leaves.filter(l => l.type === "SICK");
  const sec3 = leaves.filter(l => ["SPECIAL","MATERNITY"].includes(l.type));

  const annualCredit = Number(balance?.annualCredit ?? 0);
  const sickCredit   = Number(balance?.sickCredit   ?? 0);

  // ── Load template ───────────────────────────────────────────────────────────
  const tmplPath = path.join(process.cwd(), "public", "templates", "leave-card.xlsx");
  let buf: Buffer;
  try { buf = await readFile(tmplPath); }
  catch {
    return NextResponse.json(
      { error: "Template not found at public/templates/leave-card.xlsx" },
      { status: 500 }
    );
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const ws = wb.worksheets[0];

  // ── Template row positions ──────────────────────────────────────────────────
  // These must exactly match your leave-card.xlsx template layout:
  // Row 15 = first (template) Annual data row
  // Row 16 = Sick section header  ← shifts down when annual rows are added
  // Row 22 = first (template) Sick data row
  // Row 23 = Special section header
  // Row 28 = first (template) Special data row
  let ANNUAL_DATA   = 15;
  let SICK_SECT     = 16;
  let SICK_DATA     = 22;
  let SPECIAL_SECT  = 23;
  let SPECIAL_DATA  = 28;

  // ── Fill employee header ────────────────────────────────────────────────────
  ws.getCell("A7").value  = `ឈ្មោះបុគ្គលិក៖  ${userName}`;
  ws.getCell("A8").value  = `តួនាទី៖  ${userPos}`;
  ws.getCell("A9").value  = `ផ្នែក/សាខា  ${userDept}`;
  ws.getCell("A11").value = `ច្បាប់ឈប់សម្រាកប្រចាំឆ្នាំរយៈពេល ${kh(annualCredit)} ថ្ងៃ`;

  // ── SECTION 1: Annual / Personal / Short ───────────────────────────────────
  // If 0 leaves, leave template row blank. If >1, insert extra rows.
  const extra1 = Math.max(0, sec1.length - 1);
  if (extra1 > 0) {
    insertDataRows(ws, ANNUAL_DATA, extra1, ANNUAL_DATA);
    SICK_SECT    += extra1;
    SICK_DATA    += extra1;
    SPECIAL_SECT += extra1;
    SPECIAL_DATA += extra1;
  }

  let annualRunning = annualCredit;
  sec1.forEach((lv, i) => {
    const d = Number(lv.days  ?? 0);
    const h = Number(lv.hours ?? 0);
    annualRunning -= d;
    writeDataRow(
      ws, ANNUAL_DATA + i,
      fmtDate(lv.createdAt), fmtDate(lv.startDate), fmtDate(lv.endDate ?? lv.startDate),
      d, h, annualRunning, lv.userNote ?? "",
    );
  });

  // ── SECTION 2: Sick ────────────────────────────────────────────────────────
  const extra2 = Math.max(0, sec2.length - 1);
  if (extra2 > 0) {
    insertDataRows(ws, SICK_DATA, extra2, SICK_DATA);
    SPECIAL_SECT += extra2;
    SPECIAL_DATA += extra2;
  }

  let sickRunning = sickCredit;
  sec2.forEach((lv, i) => {
    const d = Number(lv.days  ?? 0);
    const h = Number(lv.hours ?? 0);
    sickRunning -= d;
    writeDataRow(
      ws, SICK_DATA + i,
      fmtDate(lv.createdAt), fmtDate(lv.startDate), fmtDate(lv.endDate ?? lv.startDate),
      d, h, sickRunning, lv.userNote ?? "", true,
    );
  });

  // ── SECTION 3: Special / Maternity ────────────────────────────────────────
  const extra3 = Math.max(0, sec3.length - 1);
  if (extra3 > 0) {
    insertDataRows(ws, SPECIAL_DATA, extra3, SPECIAL_DATA);
  }

  sec3.forEach((lv, i) => {
    const d = Number(lv.days  ?? 0);
    const h = Number(lv.hours ?? 0);
    writeDataRow(
      ws, SPECIAL_DATA + i,
      fmtDate(lv.createdAt), fmtDate(lv.startDate), fmtDate(lv.endDate ?? lv.startDate),
      d, h, 0, lv.userNote ?? "",
    );
  });

  // ── Output ──────────────────────────────────────────────────────────────────
  const outBuf   = await wb.xlsx.writeBuffer();
  const safeYear = year.replace(/\D/g, "");
  const safeName = userName.replace(/[^\w\u1780-\u17FF]/g, "_");

  return new NextResponse(outBuf as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="leave-card-${safeName}-${safeYear}.xlsx"`,
    },
  });
}