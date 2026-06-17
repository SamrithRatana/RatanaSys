// app/api/leave/export/[email]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { readFile } from "fs/promises";
import path from "path";
import ExcelJS from "exceljs";

type Params = { params: { email: string } };

// ── KH digit helpers ──────────────────────────────────────────────────────────
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

// ── Column helpers ────────────────────────────────────────────────────────────
function colLetterToNum(letters: string): number {
  let col = 0;
  for (let i = 0; i < letters.length; i++)
    col = col * 26 + letters.charCodeAt(i) - 64;
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

// ── Merge region type ─────────────────────────────────────────────────────────
type MergeRegion = { top: number; left: number; bottom: number; right: number };

// ── Snapshot ALL merges from the worksheet BEFORE any row mutations ────────────
// This is critical — spliceRows shifts merge addresses in the model, so we must
// capture the original positions first.
function snapshotMerges(ws: ExcelJS.Worksheet): MergeRegion[] {
  const model = (ws as any).model;
  if (!model?.merges) return [];
  return (model.merges as string[]).map((m: string) => {
    const match = m.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!match) return null;
    return {
      top:    parseInt(match[2], 10),
      left:   colLetterToNum(match[1]),
      bottom: parseInt(match[4], 10),
      right:  colLetterToNum(match[3]),
    };
  }).filter(Boolean) as MergeRegion[];
}

// ── Snapshot cell styles for a specific row (BEFORE mutations) ────────────────
type CellStyleSnapshot = { colNum: number; style: ExcelJS.Style }[];

function snapshotRowStyle(ws: ExcelJS.Worksheet, rowNum: number): { height: number; cells: CellStyleSnapshot } {
  const row = ws.getRow(rowNum);
  const cells: CellStyleSnapshot = [];
  row.eachCell({ includeEmpty: true }, (cell, colNum) => {
    cells.push({ colNum, style: JSON.parse(JSON.stringify(cell.style)) });
  });
  return { height: (row.height as number) ?? 31.35, cells };
}

// ── Apply a style snapshot to a destination row ───────────────────────────────
function applyRowStyle(
  ws: ExcelJS.Worksheet,
  dstRowNum: number,
  snapshot: ReturnType<typeof snapshotRowStyle>,
  allMerges: MergeRegion[],
  srcRowNum: number,
) {
  const dstRow = ws.getRow(dstRowNum);
  dstRow.height = snapshot.height;

  // Apply cell styles
  for (const { colNum, style } of snapshot.cells) {
    dstRow.getCell(colNum).style = JSON.parse(JSON.stringify(style));
  }

  // Apply merges that originated on srcRowNum, shifted to dstRowNum
  const offset = dstRowNum - srcRowNum;
  const rowMerges = allMerges.filter(m => m.top === srcRowNum);
  for (const m of rowMerges) {
    const tl = `${numToColLetter(m.left)}${m.top + offset}`;
    const br = `${numToColLetter(m.right)}${m.bottom + offset}`;
    try { ws.mergeCells(`${tl}:${br}`); } catch { /* skip if already merged */ }
  }

  dstRow.commit();
}

// ── Insert extra data rows after `afterRow`, styled from `styleFromRow` ───────
// Takes pre-captured snapshots so spliceRows mutations don't corrupt the lookup.
function insertDataRows(
  ws: ExcelJS.Worksheet,
  afterRow: number,
  count: number,
  styleSnapshot: ReturnType<typeof snapshotRowStyle>,
  allMerges: MergeRegion[],
  srcRowNum: number,
) {
  if (count <= 0) return;
  // Insert `count` blank rows immediately after afterRow
  ws.spliceRows(afterRow + 1, 0, ...Array(count).fill([]));
  // Apply style + merges to each inserted row
  for (let i = 0; i < count; i++) {
    applyRowStyle(ws, afterRow + 1 + i, styleSnapshot, allMerges, srcRowNum);
  }
}

// ── Write values into a data row ──────────────────────────────────────────────
function writeDataRow(
  ws: ExcelJS.Worksheet,
  rowNum: number,
  applied: string,
  start:   string,
  end:     string,
  days:    number,
  hours:   number,
  balance: number,
  note:    string,
  isSick = false,
) {
  const r = ws.getRow(rowNum);
  // Clear all cells first — prevents ghost values from broken merges
  r.eachCell({ includeEmpty: true }, (cell) => { cell.value = null; });

  r.getCell(1).value = applied;
  r.getCell(2).value = start;
  r.getCell(3).value = end;
  r.getCell(4).value = durLabel(days, hours);
  r.getCell(5).value = kh(Math.max(0, balance));
  r.getCell(isSick ? 7 : 6).value = note;
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

  // ── SNAPSHOT merges and row styles BEFORE any mutation ──────────────────────
  // This is the key fix: spliceRows mutates model.merges addresses in-place,
  // so we must read everything we need before touching the sheet.
  const allMerges = snapshotMerges(ws);

  const ANNUAL_TMPL  = 15;
  const SICK_TMPL    = 22;
  const SPECIAL_TMPL = 28;

  const annualStyleSnap  = snapshotRowStyle(ws, ANNUAL_TMPL);
  const sickStyleSnap    = snapshotRowStyle(ws, SICK_TMPL);
  const specialStyleSnap = snapshotRowStyle(ws, SPECIAL_TMPL);

  // ── Mutable row pointers (shift as rows are inserted) ──────────────────────
  let ANNUAL_DATA   = ANNUAL_TMPL;
  let SICK_DATA     = SICK_TMPL;
  let SPECIAL_DATA  = SPECIAL_TMPL;

  // ── Fill employee header ────────────────────────────────────────────────────
  ws.getCell("A7").value  = `ឈ្មោះបុគ្គលិក៖  ${userName}`;
  ws.getCell("A8").value  = `តួនាទី៖  ${userPos}`;
  ws.getCell("A9").value  = `ផ្នែក/សាខា  ${userDept}`;
  ws.getCell("A11").value = `ច្បាប់ឈប់សម្រាកប្រចាំឆ្នាំរយៈពេល ${kh(annualCredit)} ថ្ងៃ`;

  // ── SECTION 1: Annual / Personal / Short ───────────────────────────────────
  const extra1 = Math.max(0, sec1.length - 1);
  if (extra1 > 0) {
    insertDataRows(ws, ANNUAL_DATA, extra1, annualStyleSnap, allMerges, ANNUAL_TMPL);
    SICK_DATA    += extra1;
    SPECIAL_DATA += extra1;
  }

  let annualRunning = annualCredit;
  sec1.forEach((lv, i) => {
    const d = Number(lv.days ?? 0);
    const h = Number(lv.hours ?? 0);
    annualRunning -= d;
    writeDataRow(ws, ANNUAL_DATA + i,
      fmtDate(lv.createdAt), fmtDate(lv.startDate), fmtDate(lv.endDate ?? lv.startDate),
      d, h, annualRunning, lv.userNote ?? "");
  });

  // ── SECTION 2: Sick ────────────────────────────────────────────────────────
  const extra2 = Math.max(0, sec2.length - 1);
  if (extra2 > 0) {
    insertDataRows(ws, SICK_DATA, extra2, sickStyleSnap, allMerges, SICK_TMPL);
    SPECIAL_DATA += extra2;
  }

  let sickRunning = sickCredit;
  sec2.forEach((lv, i) => {
    const d = Number(lv.days ?? 0);
    const h = Number(lv.hours ?? 0);
    sickRunning -= d;
    writeDataRow(ws, SICK_DATA + i,
      fmtDate(lv.createdAt), fmtDate(lv.startDate), fmtDate(lv.endDate ?? lv.startDate),
      d, h, sickRunning, lv.userNote ?? "", true);
  });

  // ── SECTION 3: Special / Maternity ────────────────────────────────────────
  const extra3 = Math.max(0, sec3.length - 1);
  if (extra3 > 0) {
    insertDataRows(ws, SPECIAL_DATA, extra3, specialStyleSnap, allMerges, SPECIAL_TMPL);
  }

  sec3.forEach((lv, i) => {
    const d = Number(lv.days ?? 0);
    const h = Number(lv.hours ?? 0);
    writeDataRow(ws, SPECIAL_DATA + i,
      fmtDate(lv.createdAt), fmtDate(lv.startDate), fmtDate(lv.endDate ?? lv.startDate),
      d, h, 0, lv.userNote ?? "");
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
