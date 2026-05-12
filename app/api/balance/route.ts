import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

const allowedRoles = ["ADMIN", "MODERATOR"];

export async function POST(req: NextRequest) {
  const loggedInUser = await getCurrentUser();
  if (!allowedRoles.includes(loggedInUser?.role as string)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const {
      ANNUAL, SICK, PERSONAL, MATERNITY, SPECIAL,
      year, email, name, userId, telegramId,
    } = body;

    const safeEmail: string =
      email ??
      (telegramId ? `telegram-${telegramId}@noemail.local` : null) ??
      `userid-${userId}@noemail.local`;

    let resolvedEmail = safeEmail;
    if (!email && (telegramId || userId)) {
      const dbUser = await prisma.user.findFirst({
        where: {
          OR: [
            ...(telegramId ? [{ telegramId }] : []),
            ...(userId     ? [{ id: userId }] : []),
          ],
        },
        select: { email: true },
      });
      if (dbUser?.email) {
        resolvedEmail = dbUser.email;
      }
    }

    const existing = await prisma.balances.findFirst({
      where: { email: resolvedEmail, year },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Balance already exists for this user and year" },
        { status: 400 }
      );
    }

    await prisma.balances.create({
      data: {
        email:              resolvedEmail,
        name:               name ?? "Unknown",
        year,
        annualCredit:       Number(ANNUAL    ?? 0),
        annualAvailable:    Number(ANNUAL    ?? 0),
        annualUsed:         0,
        sickCredit:         Number(SICK      ?? 0),
        sickAvailable:      Number(SICK      ?? 0),
        sickUsed:           0,
        personalCredit:     Number(PERSONAL  ?? 0),
        personalAvailable:  Number(PERSONAL  ?? 0),
        personalUsed:       0,
        maternityCredit:    Number(MATERNITY ?? 0),
        maternityAvailable: Number(MATERNITY ?? 0),
        maternityUsed:      0,
        specialCredit:      Number(SPECIAL   ?? 0),
        specialAvailable:   Number(SPECIAL   ?? 0),
        specialUsed:        0,
        shortUsed:          0,
      },
    });

    return NextResponse.json({ message: "Credits added" }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

interface EditBody {
  [key: string]: number | string;
  id: string;
}

export async function PATCH(req: Request) {
  const loggedInUser = await getCurrentUser();
  if (!allowedRoles.includes(loggedInUser?.role as string)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  try {
    const body: EditBody = await req.json();
    const { id, ...data } = body;

    const { shortCredit, shortAvailable, ...safeData } = data as any;

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