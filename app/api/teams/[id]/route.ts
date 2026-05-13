import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// PATCH — update team members
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name, department, moderatorId, memberEmails } = await req.json();

  // Delete old members and re-insert
  await prisma.teamMember.deleteMany({ where: { teamId: params.id } });

  const team = await prisma.team.update({
    where: { id: params.id },
    data: {
      name,
      department,
      moderatorId,
      members: {
        create: (memberEmails as string[]).map((email) => ({ userEmail: email })),
      },
    },
    include: { members: true },
  });

  return NextResponse.json(team);
}

// DELETE — delete team
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.team.delete({ where: { id: params.id } });
  return NextResponse.json({ message: "Deleted" });
}