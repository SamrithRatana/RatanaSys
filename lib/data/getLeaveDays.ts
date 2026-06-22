import { getCurrentUser } from "../session";
import prisma from "@/lib/prisma";

export async function getAllLeaveDays() {
  try {
    const loggedInUser = await getCurrentUser();
    if (!loggedInUser) return [];

    const canAccess =
      loggedInUser.role === "ADMIN" || loggedInUser.role === "MODERATOR";
    if (!canAccess) return [];

    const leaves = await prisma.leave.findMany({
      orderBy: [{ createdAt: "desc" }],
    });
    return [...leaves];
  } catch (error) {
    console.error("Error fetching all leave days:", error);
    return [];
  }
}

export async function getUserLeaveDays() {
  try {
    const loggedInUser = await getCurrentUser();
    if (!loggedInUser) return null;

    // Build OR conditions to handle cases where userEmail might be null in old records
    const orConditions: any[] = [];

    if (loggedInUser.email) {
      orConditions.push({ userEmail: loggedInUser.email });
    }
    if (loggedInUser.name) {
      orConditions.push({ userName: loggedInUser.name });
    }

    if (orConditions.length === 0) return null;

    const leaves = await prisma.leave.findMany({
      where: { OR: orConditions },
      orderBy: [{ createdAt: "desc" }],
    });

    return leaves;
  } catch (error) {
    console.error("Error fetching user leave days:", error);
    return null;
  }
}