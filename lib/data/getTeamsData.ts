import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export async function getTeamsData() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) return [];

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { role: true, department: true },
  });
  if (!user) return [];

  const year = new Date().getFullYear().toString();

  const teams = await prisma.team.findMany({
    where: user.role === "ADMIN" ? {} : { department: user.department ?? "" },
    include: { members: true },
    orderBy: { createdAt: "desc" },
  });

  const result = await Promise.all(
    teams.map(async (team) => {
      // ✅ Auto-query moderators by department — no extra table
      const moderators = await prisma.user.findMany({
        where: { role: "MODERATOR", department: team.department },
        select: { id: true, name: true, email: true, image: true },
      });

      const members = await Promise.all(
        team.members.map(async (m: { userEmail: string }) => {
          const memberUser = await prisma.user.findUnique({
            where: { email: m.userEmail },
            select: { name: true, email: true, image: true, title: true },
          });
          const balances = await prisma.balances.findFirst({
            where: { email: m.userEmail, year },
          });
          return { ...memberUser, balances };
        })
      );

      return { ...team, moderators, members };
    })
  );

  return result;
}