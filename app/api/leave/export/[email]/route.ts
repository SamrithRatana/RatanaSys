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

// ── Copy style from one row to another (exceljs) ──────────────────────────────
function copyRowStyle(ws: ExcelJS.Worksheet, srcRowNum: number, dstRowNum: number) {
  const srcRow = ws.getRow(srcRowNum);
  const dstRow = ws.getRow(dstRowNum);
  dstRow.height = srcRow.height ?? 31.35;
  srcRow.eachCell({ includeEmpty: true }, (srcCell, colNum) => {
    const dstCell = dstRow.getCell(colNum);
    dstCell.style = { ...srcCell.style };
  });
}

// ── Insert blank rows after a given row, copy style from template row ─────────
function insertDataRows(
  ws: ExcelJS.Worksheet,
  afterRow: number,
  count: number,
  styleFromRow: number,
) {
  if (count <= 0) return;
  // Splice rows: shift everything below afterRow down by count
  ws.spliceRows(afterRow + 1, 0, ...Array(count).fill([]));
  for (let i = 0; i < count; i++) {
    copyRowStyle(ws, styleFromRow, afterRow + 1 + i);
  }
}

// ── Write a single data row ───────────────────────────────────────────────────
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
  const ws = wb.worksheets[0]; // "Level Card"

  // ── Template row positions (from template analysis) ─────────────────────────
  // Row 15 = Annual data template row   (1 blank row, then row 16 = Sick header)
  // Row 22 = Sick data template row     (1 blank row, then row 23 = Special header)
  // Row 28 = Special data template row  (1 blank row at bottom)
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
  const extra1 = Math.max(0, sec1.length - 1);
  insertDataRows(ws, ANNUAL_DATA, extra1, ANNUAL_DATA);
  SICK_SECT    += extra1;
  SICK_DATA    += extra1;
  SPECIAL_SECT += extra1;
  SPECIAL_DATA += extra1;

  let annualRunning = annualCredit;
  sec1.forEach((lv, i) => {
    const d = Number(lv.days  ?? 0);
    const h = Number(lv.hours ?? 0);
    annualRunning -= d;
    writeDataRow(ws, ANNUAL_DATA + i,
      fmtDate(lv.createdAt), fmtDate(lv.startDate), fmtDate(lv.endDate ?? lv.startDate),
      d, h, annualRunning, lv.userNote ?? "");
  });

  // ── SECTION 2: Sick ────────────────────────────────────────────────────────
  const extra2 = Math.max(0, sec2.length - 1);
  insertDataRows(ws, SICK_DATA, extra2, SICK_DATA);
  SPECIAL_SECT += extra2;
  SPECIAL_DATA += extra2;

  let sickRunning = sickCredit;
  sec2.forEach((lv, i) => {
    const d = Number(lv.days  ?? 0);
    const h = Number(lv.hours ?? 0);
    sickRunning -= d;
    writeDataRow(ws, SICK_DATA + i,
      fmtDate(lv.createdAt), fmtDate(lv.startDate), fmtDate(lv.endDate ?? lv.startDate),
      d, h, sickRunning, lv.userNote ?? "", true);
  });

  // ── SECTION 3: Special / Maternity ────────────────────────────────────────
  const extra3 = Math.max(0, sec3.length - 1);
  insertDataRows(ws, SPECIAL_DATA, extra3, SPECIAL_DATA);

  sec3.forEach((lv, i) => {
    const d = Number(lv.days  ?? 0);
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