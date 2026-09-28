import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

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