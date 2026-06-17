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

// ─────────────────────────────────────────────────────────────────────────────
// Core: duplicate a source row `count` times immediately after it,
// replicating values, styles AND merged regions — without corrupting any
// merged cells that live further down the sheet.
//
// IMPORTANT: ExcelJS's spliceRows() does NOT safely preserve merges that sit
// below the insertion point — it can silently break them apart and "fan out"
// the master cell's value into every formerly-merged cell. To avoid this we:
//   1. Snapshot every merge that starts at or below srcRowNum.
//   2. Un-merge all of those BEFORE calling spliceRows.
//   3. Splice in the new blank rows.
//   4. Re-apply the merges that originated at srcRowNum to each new row.
//   5. Re-apply all the OTHER merges (the ones that were below srcRowNum),
//      shifted down by `count` rows, restoring them exactly as they were.
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

  const cellSnapshots: Array<{ col: number; style: ExcelJS.Style; value: ExcelJS.CellValue }> = [];
  srcRow.eachCell({ includeEmpty: true }, (cell, col) => {
    cellSnapshots.push({
      col,
      style: JSON.parse(JSON.stringify(cell.style)),
      value: cell.value,
    });
  });

  // 2. Snapshot ALL merges, splitting into "starts on srcRowNum" (to be
  //    replicated onto each new row) vs "starts below srcRowNum" (needs to
  //    be preserved as-is, just shifted down by `count`).
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

  // 3. Un-merge everything below srcRowNum FIRST so spliceRows can't corrupt it.
  for (const bm of belowMerges) {
    try { ws.unMergeCells(bm.raw); } catch { /* already unmerged, ignore */ }
  }

  // 4. Shift everything below srcRowNum down by `count` using spliceRows.
  //    We splice AFTER the source row so the source row itself is untouched.
  ws.spliceRows(srcRowNum + 1, 0, ...Array(count).fill([]));

  // 5. Apply styles and merges to each newly inserted blank row
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

  // 6. Restore the merges that were below srcRowNum, shifted down by `count`.
  //    This is what keeps section headers like "ច្បាប់សម្រាកឈឺ" /
  //    "ច្បាប់សម្រាកពិសេស" (and the long note rows) as single merged cells
  //    instead of fanning their text out into every column.
  for (const bm of belowMerges) {
    const newTop    = bm.top    + count;
    const newBottom = bm.bottom + count;
    const tl = `${colLetter(bm.left)}${newTop}`;
    const br = `${colLetter(bm.right)}${newBottom}`;
    try { ws.mergeCells(`${tl}:${br}`); } catch { /* skip duplicates */ }
  }
}

// ── Text wrapping helpers ──────────────────────────────────────────────────
// Excel/ExcelJS doesn't auto-calculate row height when wrap_text is enabled
// (that's a UI-only behavior in the real Excel app). To replicate "Alt+Enter
// wrapping that fits the column" when generating the file headlessly, we
// estimate how many lines the text will need at the given column width and
// font size, then grow the row to fit — exactly like Excel does visually.
const KHMER_CHAR_WIDTH_PX = 8.4;      // avg glyph width for Khmer OS Battambang @ 10pt
                                       // (Khmer stacks subscripts/diacritics and runs wider
                                       // than a Latin-font average — 7.3 under-counted lines
                                       // and caused wrapped text to clip against row borders)
const COLUMN_WIDTH_TO_PX  = 7;        // Excel "character width" units → px (Calibri 11 baseline)
const LINE_HEIGHT_PX      = 20;       // px per wrapped line at 10pt Khmer font
                                       // (raised from 18 — Khmer vowel signs/subscripts extend
                                       // above & below the baseline more than Latin text)
const ROW_PADDING_PX      = 6;        // extra top+bottom buffer per row, mirrors the small
                                       // internal cell padding Excel itself renders around
                                       // wrapped text — without this, the last line of wrapped
                                       // text sits flush against the cell border and looks cut off
const WRAP_SAFETY_MARGIN  = 0.92;     // shrink the usable line width slightly so a line that's
                                       // right at the wrap boundary rounds up to break a line
                                       // earlier, instead of risking an overflow/clip
const MIN_ROW_HEIGHT      = 32.25;    // never shrink below the template's original row height

function estimateWrappedLines(text: string, colWidthChars: number): number {
  if (!text) return 1;
  const colWidthPx = colWidthChars * COLUMN_WIDTH_TO_PX * WRAP_SAFETY_MARGIN;
  const charsPerLine = Math.max(1, Math.floor(colWidthPx / KHMER_CHAR_WIDTH_PX));
  // Respect manual newlines (\n) as hard breaks, then estimate wraps within each segment
  const segments = text.split("\n");
  let totalLines = 0;
  for (const seg of segments) {
    totalLines += Math.max(1, Math.ceil(seg.length / charsPerLine));
  }
  return totalLines;
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
  const noteCol = isSick ? 7 : 6;
  r.getCell(noteCol).value = lv.note;

  // Font size 10 + wrap text for every populated cell in this data row
  r.eachCell({ includeEmpty: true }, cell => {
    cell.font = { ...cell.font, size: 10 };
    cell.alignment = { ...cell.alignment, wrapText: true };
  });

  // Grow row height to fit the wrapped note text (the longest field by far),
  // mirroring what "Alt+Enter" + auto-fit row height looks like in Excel.
  // ROW_PADDING_PX accounts for the small internal top/bottom padding Excel
  // itself renders around wrapped text — without it the last line sits flush
  // against the cell border and reads as clipped even though it's fully there.
  const noteColWidth = (ws.getColumn(noteCol).width as number) ?? 20;
  const lines = estimateWrappedLines(lv.note, noteColWidth);
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

  // ── Widen the "reason / មូលហេតុ" column so wrapped text (Alt+Enter style)
  //    has room to breathe instead of being squeezed/cut off at width ~21.
  const noteColumn = ws.getColumn(6); // column F
  if (!noteColumn.width || noteColumn.width < 30) {
    noteColumn.width = 30;
  }

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

  // Header VALUES must be ByteStrings (Latin-1 only). userName can contain
  // Khmer text (code points far above 255), which crashes `new Response()`
  // if placed directly in a header. So we build two filenames:
  //   - asciiName: ASCII-only fallback for the legacy `filename=` param
  //   - the full Unicode name, percent-encoded, for `filename*=UTF-8''...`
  //     (RFC 5987/6266 — what modern browsers actually use to read the
  //     real, non-ASCII filename)
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
