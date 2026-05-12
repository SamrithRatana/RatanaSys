import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";

export async function getEventsData() {
  try {
    const loggedInUser = await getCurrentUser();
    if (!loggedInUser) return [];

    const eventsData = await prisma.events.findMany({});
    return [...eventsData];
  } catch (error) {
    console.error("Error fetching events:", error);
    return [];
  }
}