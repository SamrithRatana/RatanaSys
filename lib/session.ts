import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth";
import prisma from "@/lib/prisma";

export async function getCurrentUser() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return null;

    const user = await prisma.user.findFirst({
      where: session.user.email
        ? { email: session.user.email }
        : { name: session.user.name ?? "" },
    });

    if (!user) return null;

    return {
      id:         user.id,
      name:       user.name,
      email:      user.email,
      image:      user.image,
      role:       user.role,
      telegramId: user.telegramId,
    };
  } catch (error) {
    console.error("getCurrentUser error:", error);
    return null;
  }
}