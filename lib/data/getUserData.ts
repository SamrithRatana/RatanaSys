import { getCurrentUser } from "../session";
import prisma from "@/lib/prisma";

export async function getAllUsers() {
  try {
    const loggedInUser = await getCurrentUser();
    if (!loggedInUser || loggedInUser.role !== "ADMIN") return [];

    const usersData = await prisma.user.findMany({
      orderBy: [{ name: "asc" }],
      include: { accounts: true },
    });
    return usersData;
  } catch (error) {
    console.error("Error fetching all users:", error);
    return [];
  }
}