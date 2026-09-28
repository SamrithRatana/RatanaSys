import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import { departmentLeaveEmails } from "@/lib/data/departmentScope";

interface EditBody {
  [key: string]: number | string;
  id: string;
}

const allowedRoles = ["ADMIN", "MODERATOR"];

export async function PATCH(req: Request) {
  const loggedInUser = await getCurrentUser();
  if (!allowedRoles.includes(loggedInUser?.role as string)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  try {
    const body: EditBody = await req.json();
    const { id, ...data } = body;

    // Moderators may only change balances of their own department
    if (loggedInUser?.role === "MODERATOR") {
      const target = await prisma.balances.findUnique({ where: { id }, select: { email: true } });
      const allowed = await departmentLeaveEmails(loggedInUser.department);
      if (!target || !allowed.includes(target.email)) {
        return NextResponse.json({ error: "You can only edit balances of your own department" }, { status: 403 });
      }
    }

    // Only numeric balance columns may be edited (not email/name/year)
    const EDITABLE = [
      "annualCredit", "annualUsed", "annualAvailable",
      "sickCredit", "sickUsed", "sickAvailable",
      "personalCredit", "personalUsed", "personalAvailable",
      "maternityCredit", "maternityUsed", "maternityAvailable",
      "specialCredit", "specialUsed", "specialAvailable",
      "shortUsed",
    ];
    const safeData: Record<string, number> = {};
    for (const key of EDITABLE) {
      if (data[key] === undefined || data[key] === "") continue;
      const n = Number(data[key]);
      if (!isFinite(n)) {
        return NextResponse.json({ error: `Invalid number for ${key}` }, { status: 400 });
      }
      safeData[key] = n;
    }

    await prisma.balances.update({
      where: { id },
      data:  safeData,
    });

    return NextResponse.json({ message: "Success" }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}