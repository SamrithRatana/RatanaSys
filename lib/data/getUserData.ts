// lib/data/getUserData.ts
import { getCurrentUser } from "../session";
import prisma from "@/lib/prisma";

export async function getAllUsers() {
  const loggedInUser = await getCurrentUser();
  if (!loggedInUser || loggedInUser.role !== "ADMIN") return [];

  try {
    const usersData = await prisma.user.findMany({
      orderBy: [{ name: "asc" }],   // ✅ A → Z
      include: { accounts: true },   // ✅ needed for Google/Telegram badges
    });
    return usersData;                // spreading is unnecessary, findMany already returns an array
  } catch (error) {
    console.error("Error fetching all users:", error);
    return [];
  }
}