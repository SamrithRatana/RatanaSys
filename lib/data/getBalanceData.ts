import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";

export async function getUserBalances() {
  const loggedInUser = await getCurrentUser();
  if (!loggedInUser) return null;

  // Telegram users have no email — no balances
  if (!loggedInUser.email) return null;

  try {
    const year = new Date().getFullYear().toString();
    const balances = await prisma.balances.findFirst({
      where: {
        email: loggedInUser.email,
        year,
      },
    });
    return balances;
  } catch (error) {
    console.error("Error fetching user balances:", error);
    throw new Error("Error fetching user balances");
  }
}

export async function getAllBalances() {
  const loggedInUser = await getCurrentUser();
  if (!loggedInUser) return [];

  if (loggedInUser.role !== "ADMIN") return [];

  try {
    const balances = await prisma.balances.findMany({
      orderBy: [{ year: "desc" }],
    });
    return [...balances];
  } catch (error: any) {
    console.error("Error fetching all balances:", error);
    throw new Error("Error fetching all balances");
  }
}