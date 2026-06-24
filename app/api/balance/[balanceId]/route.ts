// app/api/balance/[balanceId]/route.ts
// Replace your existing [balanceId]/route.ts with this

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
    // ✅ Get the ID from the URL param — not from the body
    const balanceId = params.balanceId;

    if (!balanceId) {
      return NextResponse.json({ error: "Missing balance ID" }, { status: 400 });
    }

    const body = await req.json();
    const { id, shortCredit, shortAvailable, ...data } = body;

    // Convert all numeric string values to actual numbers for Prisma
    const safeData: Record<string, number> = {};
    for (const [key, val] of Object.entries(data)) {
      const num = Number(val);
      if (!isNaN(num)) {
        safeData[key] = num;
      }
    }

    console.log("[PATCH /api/balance/[balanceId]] updating:", balanceId, safeData);

    const updated = await prisma.balances.update({
      where: { id: balanceId },  // ✅ Use URL param, not body
      data:  safeData,
    });

    console.log("[PATCH] success:", updated.id);

    return NextResponse.json({ message: "Success", id: updated.id }, { status: 200 });
  } catch (error) {
    console.error("[PATCH /api/balance/[balanceId]] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}