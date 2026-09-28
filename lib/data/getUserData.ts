import { getCurrentUser } from "../session";
import prisma from "@/lib/prisma";

export async function getAllUsers() {
  try {
    const loggedInUser = await getCurrentUser();
    if (!loggedInUser || loggedInUser.role !== "ADMIN") return [];

    const usersData = await prisma.user.findMany({
      orderBy: [{ name: "asc" }],
      // Never send password hashes or OAuth tokens to the browser
      include: { accounts: { select: { provider: true } } },
    });
    return usersData.map(({ password, ...u }) => ({ ...u, hasPassword: !!password }));
  } catch (error) {
    console.error("Error fetching all users:", error);
    return [];
  }
}