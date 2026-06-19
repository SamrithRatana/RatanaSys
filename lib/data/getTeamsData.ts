import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export async function getTeamsData() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) return { teams: [], teammates: [] };

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { role: true, department: true, email: true },
  });
  if (!user) return { teams: [], teammates: [] };

  const year = new Date().getFullYear().toString();

  const rawTeams = await prisma.team.findMany({
    where: user.role === "ADMIN" ? {} : { department: user.department ?? "" },
    include: { members: true },
    orderBy: { createdAt: "desc" },
  });

  const teams = await Promise.all(
    rawTeams.map(async (team) => {
      const moderators = await prisma.user.findMany({
        where: { role: "MODERATOR", department: team.department },
        select: { id: true, name: true, email: true, image: true },
      });

      const members = await Promise.all(
        team.members.map(async (m: { userEmail: string }) => {
          const memberUser = await prisma.user.findUnique({
            where: { email: m.userEmail },
            select: { id: true, name: true, email: true, image: true, title: true },
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

  // ── Find current user's team → extract teammates ──────────────────────────
  const myTeam = teams.find((team) =>
    team.members.some((m) => m.email === user.email)
  );

  const teammates = myTeam
    ? myTeam.members
        .filter((m) => m.email !== user.email)
        .map((m) => ({
          id:    m.id    ?? "",
          name:  m.name  ?? null,
          email: m.email ?? null,
          image: m.image ?? null,
        }))
    : [];

  return { teams, teammates };
}