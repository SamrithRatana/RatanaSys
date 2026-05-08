import Header from "@/components/Common/Header";
import SideBar from "@/components/Common/SideBar";
import { getCurrentUser } from "@/lib/session";
import { User } from "@prisma/client";
import { redirect } from "next/navigation";

export default async function DashLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  // ── Guard: redirect to login if no session ────────────────────────────────
  if (!user) {
    redirect("/");
  }

  return (
    <section>
      <div className="min-h-screen bg-slate-100 dark:bg-black">
        {/* <SideBar user={user as User} /> */}
        <div className="w-full">
          <Header user={user as User} />
          {children}
        </div>
      </div>
    </section>
  );
}