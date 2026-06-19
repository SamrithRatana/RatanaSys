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

  // ── Step 1: Fetch all teams + members in ONE query ──────────────────────
  const rawTeams = await prisma.team.findMany({
    where: user.role === "ADMIN" ? {} : { department: user.department ?? "" },
    include: { members: true },
    orderBy: { createdAt: "desc" },
  });

  if (rawTeams.length === 0) return { teams: [], teammates: [] };

  // ── Step 2: Collect all emails needed ───────────────────────────────────
  const allMemberEmails = rawTeams.flatMap((t) => t.members.map((m) => m.userEmail));
  const allDepartments  = [...new Set(rawTeams.map((t) => t.department))];

  // ── Step 3: Batch fetch users + balances + moderators in 3 queries ──────
  const [memberUsers, balanceRecords, moderatorUsers] = await Promise.all([
    prisma.user.findMany({
      where: { email: { in: allMemberEmails } },
      select: { id: true, name: true, email: true, image: true, title: true },
    }),
    prisma.balances.findMany({
      where: { email: { in: allMemberEmails }, year },
    }),
    prisma.user.findMany({
      where: { role: "MODERATOR", department: { in: allDepartments } },
      select: { id: true, name: true, email: true, image: true, department: true },
    }),
  ]);

  // ── Step 4: Build lookup maps ────────────────────────────────────────────
  const userMap     = new Map(memberUsers.map((u) => [u.email, u]));
  const balanceMap  = new Map(balanceRecords.map((b) => [b.email, b]));
  const modByDept   = new Map<string, typeof moderatorUsers>();

  for (const mod of moderatorUsers) {
    const dept = mod.department ?? "";
    if (!modByDept.has(dept)) modByDept.set(dept, []);
    modByDept.get(dept)!.push(mod);
  }

  // ── Step 5: Assemble teams from maps (no extra DB calls) ─────────────────
  const teams = rawTeams.map((team) => {
    const moderators = modByDept.get(team.department) ?? [];
    const members = team.members.map((m) => ({
      ...(userMap.get(m.userEmail) ?? { id: "", name: null, email: m.userEmail, image: null, title: null }),
      balances: balanceMap.get(m.userEmail) ?? null,
    }));
    return { ...team, moderators, members };
  });

  // ── Step 6: Find myTeam + build teammates ────────────────────────────────
  const myTeam = teams.find((team) => {
    if (user.role === "MODERATOR" || user.role === "ADMIN") {
      return team.department === user.department;
    }
    return team.members.some((m) => m.email === user.email);
  });

  if (!myTeam) return { teams, teammates: [] };

  const seen = new Set<string>([user.email ?? ""]);
  const teammates: { id: string; name: string | null; email: string | null; image: string | null }[] = [];

  for (const m of myTeam.members) {
    if (!m.email || seen.has(m.email)) continue;
    seen.add(m.email);
    teammates.push({ id: m.id ?? "", name: m.name, email: m.email, image: m.image });
  }

  for (const mod of myTeam.moderators) {
    if (!mod.email || seen.has(mod.email)) continue;
    seen.add(mod.email);
    teammates.push({ id: mod.id, name: mod.name, email: mod.email, image: mod.image });
  }

  return { teams, teammates };
}