import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth";
import prisma from "@/lib/prisma";

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;

  // Find user by email if available, otherwise by name (Telegram users)
  const user = await prisma.user.findFirst({
    where: session.user.email
      ? { email: session.user.email }
      : { name: session.user.name ?? "" },
  });

  if (!user) return null;

  return {
    id:         user.id,
    name:       user.name,
    email:      user.email,        // may be null for Telegram users
    image:      user.image,
    role:       user.role,
    telegramId: user.telegramId,   // for Telegram users
  };
}