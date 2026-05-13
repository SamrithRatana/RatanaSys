"use client";

import Link from "next/link";
import React from "react";
import { usePathname } from "next/navigation";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

type Props = {
  routes: { url: string; title: string; icon: React.ElementType }[];
};

export function RenderIconsRoutes({ routes }: Props) {
  const pathname = usePathname();

  return (
    <>
      {routes.map((route, index) => {
        const isActive =
          pathname === route.url || pathname.startsWith(route.url + "/");

        return (
          <Link href={route.url} key={index} className="my-3">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className={`p-2 rounded-md transition-colors
                      ${
                        isActive
                          ? "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400"
                          : "bg-slate-50 text-slate-500 dark:bg-black hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950"
                      }
                    `}
                  >
                    {React.createElement(route.icon, { size: 24 })}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{route.title}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Link>
        );
      })}
    </>
  );
}

export function RenderRoutes({ routes }: Props) {
  const pathname = usePathname();

  return (
    <>
      {routes.map((route, index) => {
        // ✅ Exact match only — no startsWith to avoid parent/child conflicts
        const isActive = pathname === route.url || pathname === route.url.replace(/\/$/, "");

        return (
          <Link
            href={route.url}
            key={index}
            className={`
              flex items-center gap-3 w-full px-2 py-2.5 my-0.5 rounded-md transition-colors
              ${
                isActive
                  ? "bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400"
                  : "hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-600"
              }
            `}
          >
            {/* Icon */}
            <span className={`shrink-0 ${isActive ? "text-blue-600 dark:text-blue-400" : "text-current"}`}>
              {React.createElement(route.icon, { size: 20 })}
            </span>

            {/* Title */}
            <span className="flex-1 text-sm font-medium truncate">
              {route.title}
            </span>

            {/* ✅ Vertical bar removed */}
          </Link>
        );
      })}
    </>
  );
}