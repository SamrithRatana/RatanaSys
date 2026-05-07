import { getCurrentUser } from "../session";
import prisma from "@/lib/prisma";
// lib/data/getLeaveDays.ts
export async function getAllLeaveDays() {
  const loggedInUser = await getCurrentUser();
  if (!loggedInUser) return [];
  const canAccess = loggedInUser.role === "ADMIN" || loggedInUser.role === "MODERATOR";
  if (!canAccess) return [];

  try {
    const leaves = await prisma.leave.findMany({
      orderBy: [{ createdAt: "desc" }],
    });
    return [...leaves];
  } catch (error) {
    console.error("Error fetching all leave days:", error);
    return []; // ✅
  }
}

export async function getUserLeaveDays() {
  const loggedInUser = await getCurrentUser();
  if (!loggedInUser || !loggedInUser.email) return [];

  try {
    const leaves = await prisma.leave.findMany({
      where: { userEmail: loggedInUser.email },
      orderBy: [{ createdAt: "desc" }],
    });
    return [...leaves];
  } catch (error) {
    console.error("Error fetching user leave days:", error);
    return []; // ✅
  }
}