import prisma from "@/lib/prisma";
import { leaveOwnerEmail } from "@/lib/leaveServer";

// Moderators (head of department) only see and approve leaves of employees
// in their own department. Admins see everything.

function norm(d: string | null | undefined): string {
  return (d ?? "").trim().toLowerCase();
}

export function sameDepartment(a: string | null | undefined, b: string | null | undefined): boolean {
  return norm(a) !== "" && norm(a) === norm(b);
}

/** Every email leaves are stored under for users of a department. */
export async function departmentLeaveEmails(department: string | null | undefined): Promise<string[]> {
  if (!norm(department)) return [];
  const users = await prisma.user.findMany({
    where:  { department: { equals: department!.trim(), mode: "insensitive" } },
    select: { id: true, email: true, telegramId: true },
  });
  return users.map((u) => leaveOwnerEmail(u));
}

/** Department of the employee who owns a leave (by its stored userEmail). */
export async function leaveOwnerDepartment(userEmail: string): Promise<string | null> {
  const where =
    userEmail.startsWith("telegram-") ? { telegramId: userEmail.slice("telegram-".length) } :
    userEmail.startsWith("userid-")   ? { id: userEmail.slice("userid-".length) } :
                                        { email: userEmail };
  const owner = await prisma.user.findFirst({ where, select: { department: true } });
  return owner?.department ?? null;
}

type Actor = {
  role: string;
  department?: string | null;
  email: string | null;
  telegramId?: string | null;
  id: string;
  allDepartments?: boolean | null;
};

/**
 * Why this user may not act on (or view) a leave, or null when allowed.
 * Admins: always allowed. Moderators: only their own department (unless
 * flagged `allDepartments`, e.g. a General Manager), and never their own
 * leave (that goes to an admin).
 */
export async function moderatorScopeError(actor: Actor, leaveUserEmail: string): Promise<string | null> {
  if (actor.role === "ADMIN") return null;
  if (actor.role !== "MODERATOR") return "You are not permitted to perform this action";

  if (leaveUserEmail === leaveOwnerEmail(actor)) {
    return "មិនអាចអនុម័តច្បាប់ផ្ទាល់ខ្លួនបានទេ — ត្រូវឱ្យ Admin អនុម័ត (You cannot approve your own leave — an admin must approve it).";
  }
  if (actor.allDepartments) return null;
  if (!norm(actor.department)) {
    return "គណនីរបស់អ្នកមិនទាន់មានផ្នែក (Department) — សូមឱ្យ Admin កំណត់ (Your account has no department — ask an admin to set it).";
  }
  const ownerDept = await leaveOwnerDepartment(leaveUserEmail);
  if (!sameDepartment(ownerDept, actor.department)) {
    return "អ្នកអាចអនុម័តបានតែច្បាប់របស់បុគ្គលិកក្នុងផ្នែករបស់អ្នកប៉ុណ្ណោះ (You can only approve leaves of employees in your own department).";
  }
  return null;
}
