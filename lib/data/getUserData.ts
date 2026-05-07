import { getCurrentUser } from "../session";
import prisma from "@/lib/prisma";
// lib/data/getUserData.ts
export async function getAllUsers() {
  const loggedInUser = await getCurrentUser();
  if (!loggedInUser || loggedInUser.role !== "ADMIN") return [];

  try {
    const usersData = await prisma.user.findMany({
      orderBy: [{ name: "desc" }],
    });
    return [...usersData];
  } catch (error) {
    console.error("Error fetching all users:", error);
    return []; // ✅ return empty, don't throw
  }
}