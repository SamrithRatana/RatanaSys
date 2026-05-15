import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";

export async function getUserBalances() {
  try {
    const loggedInUser = await getCurrentUser();
    if (!loggedInUser || !loggedInUser.email) return null;

    const year = new Date().getFullYear().toString();
    return await prisma.balances.findFirst({
      where: { email: loggedInUser.email, year },
    });
  } catch (error) {
    console.error("Error fetching user balances:", error);
    return null;
  }
}

export async function getAllBalances() {
  try {
    const loggedInUser = await getCurrentUser();
    if (!loggedInUser || !["ADMIN", "MODERATOR"].includes(loggedInUser.role as string)) return [];

    const balances = await prisma.balances.findMany({
      orderBy: [{ year: "desc" }],
    });
    return [...balances];
  } catch (error) {
    console.error("Error fetching all balances:", error);
    return [];
  }
}