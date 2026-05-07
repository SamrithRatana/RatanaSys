import { getCurrentUser } from "../session";
import prisma from "@/lib/prisma";

export async function getAllLeaveDays() {
  const loggedInUser = await getCurrentUser();
  if (!loggedInUser) return [];

  const canAccess =
    loggedInUser.role === "ADMIN" || loggedInUser.role === "MODERATOR";
  if (!canAccess) return [];

  try {
    const leaves = await prisma.leave.findMany({
      orderBy: [{ createdAt: "desc" }],
    });
    return [...leaves];
  } catch (error: any) {
    console.error("Error fetching all leave days:", error);
    throw new Error("Error fetching all leave days");
  }
}

export async function getUserLeaveDays() {
  const loggedInUser = await getCurrentUser();
  if (!loggedInUser) return [];

  try {
    // Telegram users have no email — return empty leave history
    if (!loggedInUser.email) return [];

    const leaves = await prisma.leave.findMany({
      where: { userEmail: loggedInUser.email },
      orderBy: [{ createdAt: "desc" }],
    });
    return [...leaves];
  } catch (error) {
    console.error("Error fetching user leave days:", error);
    throw new Error("Error fetching user leave days");
  }
}