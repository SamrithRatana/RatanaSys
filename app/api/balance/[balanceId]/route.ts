// File location: app/api/balance/[balanceId]/route.ts

import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

const allowedRoles = ["ADMIN", "MODERATOR"];

type Params = { params: { balanceId: string } };

export async function PATCH(req: NextRequest, { params }: Params) {
  const loggedInUser = await getCurrentUser();

  if (!allowedRoles.includes(loggedInUser?.role as string)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  try {
    // ✅ ID comes from URL param, not body
    const balanceId = params.balanceId;

    if (!balanceId) {
      return NextResponse.json({ error: "Missing balance ID" }, { status: 400 });
    }

    const body = await req.json();

    // Strip non-updatable fields
    const { id, shortCredit, shortAvailable, ...rest } = body;

    // Ensure all values are numbers (Prisma rejects strings for numeric fields)
    const safeData: Record<string, number> = {};
    for (const [key, val] of Object.entries(rest)) {
      const num = Number(val);
      if (!isNaN(num)) {
        safeData[key] = num;
      }
    }

    const updated = await prisma.balances.update({
      where: { id: balanceId },
      data:  safeData,
    });

    return NextResponse.json({ message: "Success", id: updated.id }, { status: 200 });
  } catch (error) {
    console.error("[PATCH /api/balance/[balanceId]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}