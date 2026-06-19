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

  // ── Find myTeam by department (for MODERATOR/ADMIN) or by TeamMember (for USER) ──
  let myTeam = teams.find((team) => {
    if (user.role === "MODERATOR" || user.role === "ADMIN") {
      // MODERATOR → match by department
      return team.department === user.department;
    }
    // Regular USER → match by TeamMember email
    return team.members.some((m) => m.email === user.email);
  });

  if (!myTeam) return { teams, teammates: [] };

  // ── Build teammates: team members + co-moderators, exclude self ──────────
  const seen = new Set<string>([user.email ?? ""]);
  const teammates: { id: string; name: string | null; email: string | null; image: string | null }[] = [];

  // Add team members
  for (const m of myTeam.members) {
    if (!m.email || seen.has(m.email)) continue;
    seen.add(m.email);
    teammates.push({
      id:    m.id    ?? "",
      name:  m.name  ?? null,
      email: m.email ?? null,
      image: (m as any).image ?? null,
    });
  }

  // Add co-moderators in same department (exclude self)
  for (const mod of myTeam.moderators) {
    if (!mod.email || seen.has(mod.email)) continue;
    seen.add(mod.email);
    teammates.push({
      id:    mod.id    ?? "",
      name:  mod.name  ?? null,
      email: mod.email ?? null,
      image: mod.image ?? null,
    });
  }

  return { teams, teammates };
}