import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth";
import prisma from "@/lib/prisma";
import { cache } from "react";

// ✅ cache() deduplicates calls within the same request — 
// no matter how many times getCurrentUser() is called, 
// it only hits the DB once per page render.
export const getCurrentUser = cache(async () => {
  let session: Awaited<ReturnType<typeof getServerSession>> & { user?: any } | null = null;
  try {
    session = await getServerSession(authOptions);
    if (!session?.user) return null;

    // Look up by id (always in the token) — email/name are not reliable keys
    const u = session.user;
    const user = await prisma.user.findFirst({
      where: u.id
        ? { id: u.id }
        : u.email
          ? { email: u.email }
          : { name: u.name ?? "" },
    });

    if (!user) return null;

    return {
      id:         user.id,
      name:       user.name,
      email:      user.email,
      image:      user.image,
      role:       user.role,
      telegramId: user.telegramId,
      department: user.department,
    };
  } catch (error) {
    console.error("getCurrentUser error:", error);
    // The session cookie is still valid — keep the user signed in from the token
    // instead of bouncing them to the login page because the DB blipped.
    const u = session?.user;
    if (u?.id) {
      return {
        id:         u.id as string,
        name:       (u.name ?? null) as string | null,
        email:      (u.email ?? null) as string | null,
        image:      (u.image ?? null) as string | null,
        role:       (u.role ?? "USER") as string,
        telegramId: (u.telegramId ?? null) as string | null,
        department: null as string | null,
      };
    }
    return null;
  }
});