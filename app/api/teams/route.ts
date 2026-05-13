import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ✅ Fetch full user from DB to get department field
  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, role: true, department: true },
  });

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (user.role === "ADMIN") {
    const teams = await prisma.team.findMany({
      include: { members: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(teams);
  }

  if (user.role === "MODERATOR") {
    const teams = await prisma.team.findMany({
      where: { department: user.department ?? "" },
      include: { members: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(teams);
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { role: true },
  });

  if (!user || user.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const name         = body.name         as string;
  const department   = body.department   as string;
  const moderatorId  = body.moderatorId  as string;
  const memberEmails = body.memberEmails as string[];

  const team = await prisma.team.create({
    data: {
      name,
      department,
      moderatorId,
      members: {
        create: memberEmails.map((email: string) => ({ userEmail: email })),
      },
    },
    include: { members: true },
  });

  return NextResponse.json(team, { status: 201 });
}