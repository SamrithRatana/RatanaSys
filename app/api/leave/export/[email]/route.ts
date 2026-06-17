// app/api/leave/export/[email]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { execFile }                  from "child_process";
import { promisify }                 from "util";
import { getCurrentUser }            from "@/lib/session";
import prisma                        from "@/lib/prisma";
import path                          from "path";

const execFileAsync = promisify(execFile);

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
    if (m < 60)       return `${kh(m)} នាទី`;
    if (m % 60 === 0) return `${kh(m / 60)} ម៉ោង`;
    return `${kh(Math.floor(m / 60))} ម៉ោង ${kh(m % 60)} នាទី`;
  }
  return "—";
}

type LeaveRow = {
  applied: string;
  start:   string;
  end:     string;
  dur:     string;
  balance: string;
  note:    string;
};

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

  const annualCredit = Number(balance?.annualCredit ?? 0);
  const sickCredit   = Number(balance?.sickCredit   ?? 0);

  // ── Build section arrays ────────────────────────────────────────────────────
  let annualRunning = annualCredit;
  const sec1: LeaveRow[] = leaves
    .filter(l => ["ANNUAL", "PERSONAL", "SHORT"].includes(l.type))
    .map(lv => {
      const d = Number(lv.days ?? 0);
      const h = Number(lv.hours ?? 0);
      annualRunning -= d;
      return {
        applied: fmtDate(lv.createdAt),
        start:   fmtDate(lv.startDate),
        end:     fmtDate(lv.endDate ?? lv.startDate),
        dur:     durLabel(d, h),
        balance: kh(Math.max(0, annualRunning)),
        note:    lv.userNote ?? "",
      };
    });

  let sickRunning = sickCredit;
  const sec2: LeaveRow[] = leaves
    .filter(l => l.type === "SICK")
    .map(lv => {
      const d = Number(lv.days ?? 0);
      const h = Number(lv.hours ?? 0);
      sickRunning -= d;
      return {
        applied: fmtDate(lv.createdAt),
        start:   fmtDate(lv.startDate),
        end:     fmtDate(lv.endDate ?? lv.startDate),
        dur:     durLabel(d, h),
        balance: kh(Math.max(0, sickRunning)),
        note:    lv.userNote ?? "",
      };
    });

  const sec3: LeaveRow[] = leaves
    .filter(l => ["SPECIAL", "MATERNITY"].includes(l.type))
    .map(lv => {
      const d = Number(lv.days ?? 0);
      const h = Number(lv.hours ?? 0);
      return {
        applied: fmtDate(lv.createdAt),
        start:   fmtDate(lv.startDate),
        end:     fmtDate(lv.endDate ?? lv.startDate),
        dur:     durLabel(d, h),
        balance: "០",
        note:    lv.userNote ?? "",
      };
    });

  // ── Build Python payload ────────────────────────────────────────────────────
  const tmplPath = path.join(process.cwd(), "public", "templates", "leave-card.xlsx");
  const scriptPath = path.join(process.cwd(), "public", "scripts", "leave_card_export.py");

  const payload = JSON.stringify({
    templatePath:  tmplPath,
    headerName:    `ឈ្មោះបុគ្គលិក៖  ${userName}`,
    headerPos:     `តួនាទី៖  ${userPos}`,
    headerDept:    `ផ្នែក/សាខា  ${userDept}`,
    headerCredit:  `ច្បាប់ឈប់សម្រាកប្រចាំឆ្នាំរយៈពេល ${kh(annualCredit)} ថ្ងៃ`,
    sec1,
    sec2,
    sec3,
  });

  // ── Call Python script ──────────────────────────────────────────────────────
  let outBuf: Buffer;
  try {
    const { stdout, stderr } = await execFileAsync(
      "python3",
      [scriptPath],
      {
        input:    payload,
        encoding: "buffer",
        maxBuffer: 10 * 1024 * 1024, // 10 MB
      } as any,
    );
    if (stderr && (stderr as any).length > 0) {
      console.error("[leave-export] python stderr:", (stderr as Buffer).toString());
    }
    outBuf = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout as unknown as ArrayBuffer);
  } catch (err: any) {
    console.error("[leave-export] python error:", err.stderr?.toString?.() ?? err);
    return NextResponse.json(
      { error: "Export failed: " + (err.stderr?.toString?.() ?? String(err)) },
      { status: 500 },
    );
  }

  // ── Return xlsx ─────────────────────────────────────────────────────────────
  const safeYear = year.replace(/\D/g, "");
  const safeName = userName.replace(/[^\w\u1780-\u17FF]/g, "_");

  return new NextResponse(new Uint8Array(outBuf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="leave-card-${safeName}-${safeYear}.xlsx"`,
    },
  });
}