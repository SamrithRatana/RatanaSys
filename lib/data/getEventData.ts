import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";

export async function getEventsData() {
  const loggedInUser = await getCurrentUser();
  if (!loggedInUser) return [];

  try {
    const eventsData = await prisma.events.findMany({});
    return [...eventsData];
  } catch (error) {
    console.error("Error fetching events:", error);
    throw new Error("Error fetching events");
  }
}