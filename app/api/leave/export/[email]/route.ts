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
  applied: string; start: string; end: string;
  dur: string; balance: string; note: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Core: duplicate a source row `count` times immediately after it,
// replicating values, styles AND merged regions — without touching any other row.
//
// Key insight: instead of spliceRows (which corrupts adjacent merged regions),
// we manually clone the ExcelJS row object and re-apply it.
// ─────────────────────────────────────────────────────────────────────────────
function cloneRowAfter(
  ws: ExcelJS.Worksheet,
  srcRowNum: number,
  count: number,
) {
  if (count <= 0) return;

  // 1. Capture source row data BEFORE we touch anything
  const srcRow    = ws.getRow(srcRowNum);
  const srcHeight = (srcRow.height as number) ?? 20;

  // Capture cell styles and values from source
  const cellSnapshots: Array<{ col: number; style: ExcelJS.Style; value: ExcelJS.CellValue }> = [];
  srcRow.eachCell({ includeEmpty: true }, (cell, col) => {
    cellSnapshots.push({
      col,
      style: JSON.parse(JSON.stringify(cell.style)),
      value: cell.value,
    });
  });

  // 2. Collect ALL current merge strings from the model BEFORE splicing
  //    (spliceRows will mutate these, so we read them now)
  const modelBefore = (ws as any)._merges as Record<string, ExcelJS.Range> | undefined;
  // Alternative access path used by different ExcelJS versions:
  const mergeModel  = (ws as any).model?.merges as string[] | undefined;

  // Build a map of merges that start on srcRowNum
  interface MergeInfo { left: number; right: number; rowSpan: number }
  const srcMerges: MergeInfo[] = [];

  if (mergeModel) {
    for (const ms of mergeModel) {
      // format: "A15:E15"
      const m = ms.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
      if (!m) continue;
      const top = parseInt(m[2], 10);
      if (top !== srcRowNum) continue;
      srcMerges.push({
        left:    colNum(m[1]),
        right:   colNum(m[3]),
        rowSpan: parseInt(m[4], 10) - top,
      });
    }
  }

  // 3. Shift everything below srcRowNum down by `count` using spliceRows
  //    We splice AFTER the source row so the source row itself is untouched.
  ws.spliceRows(srcRowNum + 1, 0, ...Array(count).fill([]));

  // 4. Apply styles and merges to each newly inserted blank row
  for (let i = 0; i < count; i++) {
    const dstRowNum = srcRowNum + 1 + i;
    const dstRow    = ws.getRow(dstRowNum);
    dstRow.height   = srcHeight;

    // Apply cell styles (no values — data rows stay blank until written)
    for (const snap of cellSnapshots) {
      const dstCell = dstRow.getCell(snap.col);
      dstCell.style = JSON.parse(JSON.stringify(snap.style));
      dstCell.value = null;
    }

    // Re-apply merges shifted to this row
    for (const mg of srcMerges) {
      const tl = `${colLetter(mg.left)}${dstRowNum}`;
      const br = `${colLetter(mg.right)}${dstRowNum + mg.rowSpan}`;
      try { ws.mergeCells(`${tl}:${br}`); } catch { /* skip duplicates */ }
    }

    dstRow.commit();
  }
}

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

// ── Write data into one row ───────────────────────────────────────────────────
function writeRow(
  ws: ExcelJS.Worksheet,
  rowNum: number,
  lv: LeaveRow,
  isSick = false,
) {
  const r = ws.getRow(rowNum);
  // Clear first (avoids stale values)
  r.eachCell({ includeEmpty: true }, c => { c.value = null; });
  r.getCell(1).value = lv.applied;
  r.getCell(2).value = lv.start;
  r.getCell(3).value = lv.end;
  r.getCell(4).value = lv.dur;
  r.getCell(5).value = lv.balance;
  r.getCell(isSick ? 7 : 6).value = lv.note;
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
    .filter(l => ["ANNUAL","PERSONAL","SHORT"].includes(l.type))
    .map(lv => {
      const d = Number(lv.days ?? 0), h = Number(lv.hours ?? 0);
      annualBal -= d;
      return { applied: fmtDate(lv.createdAt), start: fmtDate(lv.startDate),
               end: fmtDate(lv.endDate ?? lv.startDate), dur: durLabel(d, h),
               balance: kh(Math.max(0, annualBal)), note: lv.userNote ?? "" };
    });

  let sickBal = sickCredit;
  const sec2: LeaveRow[] = leaves
    .filter(l => l.type === "SICK")
    .map(lv => {
      const d = Number(lv.days ?? 0), h = Number(lv.hours ?? 0);
      sickBal -= d;
      return { applied: fmtDate(lv.createdAt), start: fmtDate(lv.startDate),
               end: fmtDate(lv.endDate ?? lv.startDate), dur: durLabel(d, h),
               balance: kh(Math.max(0, sickBal)), note: lv.userNote ?? "" };
    });

  const sec3: LeaveRow[] = leaves
    .filter(l => ["SPECIAL","MATERNITY"].includes(l.type))
    .map(lv => {
      const d = Number(lv.days ?? 0), h = Number(lv.hours ?? 0);
      return { applied: fmtDate(lv.createdAt), start: fmtDate(lv.startDate),
               end: fmtDate(lv.endDate ?? lv.startDate), dur: durLabel(d, h),
               balance: "០", note: lv.userNote ?? "" };
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

  // ── Header ──────────────────────────────────────────────────────────────────
  ws.getCell("A7").value  = `ឈ្មោះបុគ្គលិក៖  ${userName}`;
  ws.getCell("A8").value  = `តួនាទី៖  ${userPos}`;
  ws.getCell("A9").value  = `ផ្នែក/សាខា  ${userDept}`;
  ws.getCell("A11").value = `ច្បាប់ឈប់សម្រាកប្រចាំឆ្នាំរយៈពេល ${kh(annualCredit)} ថ្ងៃ`;

  // ── Template data row positions (verified from leave-card.xlsx analysis) ────
  // Row 15 = annual data row
  // Row 22 = sick data row   (these are the ONLY rows we clone — no section headers touched)
  // Row 28 = special data row
  let R1 = 15, R2 = 22, R3 = 28;

  // ── Section 1: insert extra annual rows ────────────────────────────────────
  const extra1 = sec1.length - 1;  // template already has 1 row
  if (extra1 > 0) {
    cloneRowAfter(ws, R1, extra1);
    R2 += extra1;
    R3 += extra1;
  }
  // Write annual data (or clear if no leaves)
  for (let i = 0; i < Math.max(sec1.length, 1); i++) {
    if (sec1[i]) writeRow(ws, R1 + i, sec1[i]);
  }

  // ── Section 2: insert extra sick rows ──────────────────────────────────────
  const extra2 = sec2.length - 1;
  if (extra2 > 0) {
    cloneRowAfter(ws, R2, extra2);
    R3 += extra2;
  }
  for (let i = 0; i < Math.max(sec2.length, 1); i++) {
    if (sec2[i]) writeRow(ws, R2 + i, sec2[i], true);
  }

  // ── Section 3: insert extra special rows ───────────────────────────────────
  const extra3 = sec3.length - 1;
  if (extra3 > 0) cloneRowAfter(ws, R3, extra3);
  for (let i = 0; i < Math.max(sec3.length, 1); i++) {
    if (sec3[i]) writeRow(ws, R3 + i, sec3[i]);
  }

  // ── Output ──────────────────────────────────────────────────────────────────
  const outBuf   = await wb.xlsx.writeBuffer();
  const safeYear = year.replace(/\D/g, "");
  const safeName = userName.replace(/[^\w\u1780-\u17FF]/g, "_");

  return new NextResponse(new Uint8Array(outBuf as ArrayBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="leave-card-${safeName}-${safeYear}.xlsx"`,
    },
  });
}