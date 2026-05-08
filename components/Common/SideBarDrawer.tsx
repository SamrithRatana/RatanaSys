"use client";

import Image from "next/image";
import { TiThMenu } from "react-icons/ti";
import ToggleDarkLight from "./ToggleDarkLight";
import { RenderRoutes } from "./RenderRoutes";
import { AdminRoutes, ModeratorRoutes, UserRoutes } from "./Routes";
import { Sheet, SheetContent, SheetTrigger } from "../ui/sheet";
import { User } from "@prisma/client";
import LogoutBtn from "./LogoutBtn";
import SystemIntegration from "../SystemIntegration";

type SideBarDrawerProps = {
  user: User & { accounts?: { provider: string }[] };
};

const SideBarDrawer = ({ user }: SideBarDrawerProps) => {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          className="p-2 bg-blue-100 rounded-full text-blue-500 touch-manipulation"
          type="button"
        >
          <TiThMenu size={24} />
        </button>
      </SheetTrigger>

      <SheetContent
        side="left"
        className="flex flex-col justify-between w-52 touch-manipulation [&>button]:hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => {
          // iOS Safari fires pointerdown on the overlay — allow it to close
          e.stopPropagation();
        }}
        onInteractOutside={(e) => {
          // Fallback for iOS Safari touch events that bypass pointerdown
          e.stopPropagation();
        }}
      >
        <div>
          <div className="flex mt-3 justify-center">
            <Image
              src="/LMS.png"
              width={180}
              height={180}
              alt="LMS Logo"
              className="object-contain"
            />
          </div>

          <nav
            className="flex flex-col items-center px-3 overflow-y-auto"
            style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
          >
            {user?.role === "ADMIN"     && <>{RenderRoutes({ routes: AdminRoutes })}</>}
            {user?.role === "USER"      && <>{RenderRoutes({ routes: UserRoutes })}</>}
            {user?.role === "MODERATOR" && <>{RenderRoutes({ routes: ModeratorRoutes })}</>}
          </nav>
        </div>

        {/* BOTTOM */}
        <div className="flex items-center justify-around pb-2">
          <ToggleDarkLight />
          <SystemIntegration user={user} />
          <LogoutBtn />
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default SideBarDrawer;