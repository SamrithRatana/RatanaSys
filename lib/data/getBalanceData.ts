import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
// lib/data/getBalanceData.ts
export async function getUserBalances() {
  const loggedInUser = await getCurrentUser();
  if (!loggedInUser || !loggedInUser.email) return null;

  try {
    const year = new Date().getFullYear().toString();
    return await prisma.balances.findFirst({
      where: { email: loggedInUser.email, year },
    });
  } catch (error) {
    console.error("Error fetching user balances:", error);
    return null; // ✅
  }
}

export async function getAllBalances() {
  const loggedInUser = await getCurrentUser();
  if (!loggedInUser || loggedInUser.role !== "ADMIN") return [];

  try {
    const balances = await prisma.balances.findMany({
      orderBy: [{ year: "desc" }],
    });
    return [...balances];
  } catch (error) {
    console.error("Error fetching all balances:", error);
    return []; // ✅
  }
}