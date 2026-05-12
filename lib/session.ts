import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth";
import prisma from "@/lib/prisma";
import { cache } from "react";

// ✅ cache() deduplicates calls within the same request — 
// no matter how many times getCurrentUser() is called, 
// it only hits the DB once per page render.
export const getCurrentUser = cache(async () => {
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
});