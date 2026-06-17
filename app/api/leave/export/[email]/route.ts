// app/api/leave/export/[email]/route.ts
// GET /api/leave/export/:email?year=2026
// Returns a filled Excel leave card for the given employee

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { readFile } from "fs/promises";
import path from "path";
import ExcelJS from "exceljs";

type Params = { params: { email: string } };

// ── Khmer number map ───────────────────────────────────────────────────────────
const KH_DIGITS: Record<string, string> = {
  "0": "០","1": "១","2": "២","3": "៣","4": "៤",
  "5": "៥","6": "៦","7": "៧","8": "៨","9": "៩",
};
function toKhmerNum(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => KH_DIGITS[d]);
}
function formatDateKh(date: Date): string {
  const d = date.getDate().toString().padStart(2, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const y = date.getFullYear().toString();
  return `${d}/${m}/${y}`;
}

export async function GET(req: NextRequest, { params }: Params) {
  const loggedInUser = await getCurrentUser();
  if (!loggedInUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = decodeURIComponent(params.email);
  const year  = req.nextUrl.searchParams.get("year") ?? new Date().getFullYear().toString();

  // Only ADMIN/MODERATOR can export for others
  if (
    loggedInUser.email !== email &&
    loggedInUser.role !== "ADMIN" &&
    loggedInUser.role !== "MODERATOR"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Fetch data ─────────────────────────────────────────────────────────────
  const [leaves, balance, userRecord] = await Promise.all([
    prisma.leave.findMany({
      where: {
        userEmail: email,
        year,
        status: "APPROVED",
      },
      orderBy: { startDate: "asc" },
    }),
    prisma.balances.findFirst({ where: { email, year } }),
    prisma.user.findUnique({ where: { email } }),
  ]);

  const userName     = userRecord?.name ?? leaves[0]?.userName ?? email;
  const userPosition = (userRecord as any)?.position ?? "";
  const userDept     = (userRecord as any)?.department ?? "";

  const annualLeaves   = leaves.filter((l) => l.type === "ANNUAL");
  const sickLeaves     = leaves.filter((l) => l.type === "SICK");
  const specialLeaves  = leaves.filter((l) => l.type === "SPECIAL" || l.type === "MATERNITY");
  const personalLeaves = leaves.filter((l) => l.type === "PERSONAL" || l.type === "SHORT");

  // ── Load template ──────────────────────────────────────────────────────────
  const templatePath = path.join(process.cwd(), "public", "templates", "leave-card.xlsx");
  let templateBuffer: Buffer;
  try {
    templateBuffer = await readFile(templatePath);
  } catch {
    return NextResponse.json(
      { error: "Template file not found at public/templates/leave-card.xlsx" },
      { status: 500 }
    );
  }

  const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(templateBuffer as any);
  const ws = workbook.worksheets[0]; // "Level Card"

  // ── Helper: write to cell without breaking merges ──────────────────────────
  function write(cell: string, value: string | number) {
    const c = ws.getCell(cell);
    c.value = value;
  }

  // ── HEADER — employee info ─────────────────────────────────────────────────
  // Row 7: employee name (after label in A7)
  write("A7", `ឈ្មោះបុគ្គលិក៖  ${userName}`);
  // Row 8: position
  write("A8", `តួនាទី៖  ${userPosition}`);
  // Row 9: department
  write("A9", `ផ្នែក/សាខា  ${userDept}`);

  // Annual leave credit line (row 11)
  const annualCredit = balance?.annualCredit ?? 0;
  write("A11", `ច្បាប់ឈប់សម្រាកប្រចាំឆ្នាំរយៈពេល ${toKhmerNum(annualCredit)} ថ្ងៃ`);

  // ── SECTION 1: ANNUAL LEAVE (data rows 15–40) ─────────────────────────────
  // Also include PERSONAL leaves in annual section rows
  const section1 = [...annualLeaves, ...personalLeaves].slice(0, 20);
  let annualUsed = 0;

  section1.forEach((leave, i) => {
    const row  = 15 + i;
    const days = Number(leave.days ?? 0);
    const hrs  = Number(leave.hours ?? 0);
    annualUsed += days;
    const durationLabel = hrs > 0 && days === 0
      ? `${Math.round(hrs * 60)} នាទី`
      : days > 0 && hrs > 0
        ? `${days}ថ្ងៃ ${Math.round(hrs * 60)}នាទី`
        : `${days} ថ្ងៃ`;

    write(`A${row}`, formatDateKh(new Date(leave.createdAt)));
    write(`B${row}`, formatDateKh(new Date(leave.startDate)));
    write(`C${row}`, formatDateKh(new Date(leave.endDate ?? leave.startDate)));
    write(`D${row}`, toKhmerNum(days) || durationLabel);
    write(`E${row}`, toKhmerNum(Math.max(0, annualCredit - annualUsed)));
    write(`F${row}`, leave.userNote ?? "");
  });

  // ── SECTION 2: SICK LEAVE (data rows 50–59) ───────────────────────────────
  const sickCredit = balance?.sickCredit ?? 0;
  let sickUsed = 0;

  // Header row 42 — employee name again for sick section
  write("A42", `ឈ្មោះបុគ្គលិក៖  ${userName}`);
  write("A43", `តួនាទី៖  ${userPosition}`);
  write("A44", `ផ្នែក/សាខា  ${userDept}`);

  sickLeaves.slice(0, 8).forEach((leave, i) => {
    const row  = 50 + i;
    const days = Number(leave.days ?? 0);
    const hrs  = Number(leave.hours ?? 0);
    sickUsed += days;

    write(`A${row}`, formatDateKh(new Date(leave.createdAt)));
    write(`B${row}`, formatDateKh(new Date(leave.startDate)));
    write(`C${row}`, formatDateKh(new Date(leave.endDate ?? leave.startDate)));
    write(`D${row}`, toKhmerNum(days));
    write(`E${row}`, toKhmerNum(Math.max(0, sickCredit - sickUsed)));
    // Column F: signature placeholder, G: illness type from note
    write(`G${row}`, leave.userNote ?? "");
  });

  // ── SECTION 3: SPECIAL LEAVE (data rows 65–75) ────────────────────────────
  // Header row 42 equivalent for special
  specialLeaves.slice(0, 8).forEach((leave, i) => {
    const row  = 65 + i;
    const days = Number(leave.days ?? 0);

    write(`A${row}`, formatDateKh(new Date(leave.createdAt)));
    write(`B${row}`, formatDateKh(new Date(leave.startDate)));
    write(`C${row}`, formatDateKh(new Date(leave.endDate ?? leave.startDate)));
    write(`D${row}`, toKhmerNum(days));
    write(`E${row}`, "");
    write(`F${row}`, leave.userNote ?? "");
  });

  // ── Output ─────────────────────────────────────────────────────────────────
  const buffer = await workbook.xlsx.writeBuffer();
  const safeYear = year.replace(/[^\d]/g, "");
  const safeName = userName.replace(/[^\w\u1780-\u17FF]/g, "_");

  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="leave-card-${safeName}-${safeYear}.xlsx"`,
    },
  });
}
