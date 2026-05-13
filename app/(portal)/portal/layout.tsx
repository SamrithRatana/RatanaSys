import Header from "@/components/Common/Header";
import { getCurrentUser } from "@/lib/session";
import { User } from "@prisma/client";
import { redirect } from "next/navigation";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  // ✅ Guard added — same as dashboard layout
  if (!user) {
    redirect("/");
  }

  return (
    <section>
      <div className="min-h-screen bg-slate-100 dark:bg-black">
        <div className="w-full">
          <Header user={user as User} />
          {children}
        </div>
      </div>
    </section>
  );
}