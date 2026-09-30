// app/api/leave/export/[email]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser }            from "@/lib/session";
import prisma                        from "@/lib/prisma";
import { readFile }                  from "fs/promises";
import path                          from "path";
import { canExportAllLeaveCards, todayYmd } from "@/lib/leaveRules";
import { buildLeaveCard }            from "@/lib/leaveCardWorkbook";

type Params = { params: { email: string } };

// GET — the employee's leave card (ប័ណ្ណសុំច្បាប់) for a year, as Excel.
export async function GET(req: NextRequest, { params }: Params) {
  const loggedInUser = await getCurrentUser();
  if (!loggedInUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const email = decodeURIComponent(params.email);
  const yearParam = req.nextUrl.searchParams.get("year") ?? "";
  const year  = /^\d{4}$/.test(yearParam) ? yearParam : todayYmd().slice(0, 4);

  if (
    loggedInUser.email !== email &&
    loggedInUser.role  !== "ADMIN" &&
    loggedInUser.role  !== "MODERATOR" &&
    !canExportAllLeaveCards(loggedInUser.department)
  ) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // ── Fetch ───────────────────────────────────────────────────────────────────
  // Rejected leaves are not part of the leave card. Old rows saved with
  // year = "" are matched by their start date.
  const [leaves, balance, userRecord] = await Promise.all([
    prisma.leave.findMany({
      where: {
        userEmail: email,
        status:    { not: "REJECTED" },
        OR: [
          { year },
          {
            year: "",
            startDate: {
              gte: new Date(`${year}-01-01T00:00:00.000Z`),
              lte: new Date(`${year}-12-31T23:59:59.999Z`),
            },
          },
        ],
      },
      orderBy: { startDate: "asc" },
    }),
    prisma.balances.findUnique({ where: { email_year: { email, year } } }),
    prisma.user.findUnique({ where: { email } }),
  ]);

  const userName = userRecord?.name ?? leaves[0]?.userName ?? email;

  // ── Load template ───────────────────────────────────────────────────────────
  const tmplPath = path.join(process.cwd(), "public", "templates", "leave-card.xlsx");
  let template: Buffer;
  try { template = await readFile(tmplPath); }
  catch {
    return NextResponse.json({ error: "Template not found" }, { status: 500 });
  }

  const outBuf = await buildLeaveCard({
    template,
    year,
    userName,
    userPos:  userRecord?.title      ?? "",
    userDept: userRecord?.department ?? "",
    balance,
    leaves,
  });

  // ── Output ──────────────────────────────────────────────────────────────────
  const safeYear = year.replace(/\D/g, "");
  const asciiName = userName.replace(/[^\x20-\x7E]/g, "").trim().replace(/\s+/g, "_") || "leave-card";
  const fallbackFilename = `leave-card-${asciiName}-${safeYear}.xlsx`;
  const utf8Filename = encodeURIComponent(`leave-card-${userName}-${safeYear}.xlsx`);

  return new NextResponse(new Uint8Array(outBuf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${utf8Filename}`,
    },
  });
}
