import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

type SubmittedCredits = {
  ANNUAL:    number;
  SICK:      number;
  PERSONAL:  number;
  MATERNITY: number;
  SPECIAL:   number;
  email: string;
  year:  string;
  name:  string;
};

const allowedRoles = ["ADMIN", "MODERATOR"];

export async function POST(req: NextRequest) {
  const loggedInUser = await getCurrentUser();
  if (!allowedRoles.includes(loggedInUser?.role as Role)) {
    throw new Error("You are not permitted to perform this action");
  }

  try {
    const body: SubmittedCredits = await req.json();
    const { ANNUAL, SICK, PERSONAL, MATERNITY, SPECIAL, year, email, name } = body;

    await prisma.balances.upsert({
      where: {
        email_year: { email, year },
      },
      create: {
        name,
        email,
        year,
        annualCredit:       ANNUAL    ?? 0,
        annualUsed:         0,
        annualAvailable:    ANNUAL    ?? 0,
        sickCredit:         SICK      ?? 0,
        sickUsed:           0,
        sickAvailable:      SICK      ?? 0,
        personalCredit:     PERSONAL  ?? 0,
        personalUsed:       0,
        personalAvailable:  PERSONAL  ?? 0,
        maternityCredit:    MATERNITY ?? 0,
        maternityUsed:      0,
        maternityAvailable: MATERNITY ?? 0,
        specialCredit:      SPECIAL   ?? 0,
        specialUsed:        0,
        specialAvailable:   SPECIAL   ?? 0,
        shortUsed:          0,
      },
      update: {
        // Only update credits — preserve used values already tracked
        annualCredit:       ANNUAL    ?? 0,
        annualAvailable:    ANNUAL    ?? 0,
        sickCredit:         SICK      ?? 0,
        sickAvailable:      SICK      ?? 0,
        personalCredit:     PERSONAL  ?? 0,
        personalAvailable:  PERSONAL  ?? 0,
        maternityCredit:    MATERNITY ?? 0,
        maternityAvailable: MATERNITY ?? 0,
        specialCredit:      SPECIAL   ?? 0,
        specialAvailable:   SPECIAL   ?? 0,
      },
    });

    return NextResponse.json({ message: "Success" }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}