import Link from "next/link";
import React from "react";
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
  return (
    <>
      {routes.map((route, index) => (
        <Link href={route.url} key={index} className="my-3">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="bg-slate-50 p-2 text-slate-500 rounded-md dark:bg-black">
                  {React.createElement(route.icon, { size: 24 })}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{route.title}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </Link>
      ))}
    </>
  );
}

export function RenderRoutes({ routes }: Props) {
  return (
    <>
      {routes.map((route, index) => (
        <Link
          href={route.url}
          key={index}
          className="flex items-center gap-3 w-full px-2 py-2.5 my-0.5 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-600 transition-colors"
        >
          {/* Icon — fixed size, never shrinks */}
          <span className="shrink-0 text-current">
            {React.createElement(route.icon, { size: 20 })}
          </span>

          {/* Title — takes remaining space, truncates if needed */}
          <span className="flex-1 text-sm font-medium truncate">
            {route.title}
          </span>
        </Link>
      ))}
    </>
  );
}