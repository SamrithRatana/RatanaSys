import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
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
  const memberEmails = body.memberEmails as string[];

  await prisma.teamMember.deleteMany({ where: { teamId: params.id } });

  const team = await prisma.team.update({
    where: { id: params.id },
    data: {
      name,
      department,
      members: {
        create: memberEmails.map((email: string) => ({ userEmail: email })),
      },
    },
    include: { members: true },
  });

  return NextResponse.json(team);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { role: true },
  });
  if (!user || user.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.team.delete({ where: { id: params.id } });
  return NextResponse.json({ message: "Deleted" });
}