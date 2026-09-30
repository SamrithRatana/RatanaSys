import { getCurrentUser } from "../session";
import prisma from "@/lib/prisma";
import { departmentLeaveEmails } from "@/lib/data/departmentScope";

export async function getAllLeaveDays() {
  try {
    const loggedInUser = await getCurrentUser();
    if (!loggedInUser) return [];

    const canAccess =
      loggedInUser.role === "ADMIN" || loggedInUser.role === "MODERATOR";
    if (!canAccess) return [];

    // Moderators only see leaves of employees in their own department,
    // unless they're flagged to see every department (e.g. General Manager)
    const where =
      loggedInUser.role === "MODERATOR" && !loggedInUser.allDepartments
        ? { userEmail: { in: await departmentLeaveEmails(loggedInUser.department) } }
        : {};

    const leaves = await prisma.leave.findMany({
      where,
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

    const orConditions: any[] = [];
    if (loggedInUser.email) orConditions.push({ userEmail: loggedInUser.email });
    if (loggedInUser.name)  orConditions.push({ userName:  loggedInUser.name  });
    if (orConditions.length === 0) return null;

    const leaves = await prisma.leave.findMany({
      where:   { OR: orConditions },
      orderBy: [{ createdAt: "desc" }],
    });

    return leaves;
  } catch (error) {
    console.error("Error fetching user leave days:", error);
    return null;
  }
}