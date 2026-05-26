"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Events } from "@prisma/client";

type Props = {
  events: Events[];
  date: number;
  hasManualEvent: boolean;
  hasLeaveEvent: boolean;
};

// Leave events: English pattern OR Khmer "ឈប់សម្រាក"
const isLeaveEvent = (title: string) =>
  /\bon\s+\w.*Leave\b/i.test(title) || title.includes("ឈប់សម្រាក");

export default function EventPopOver({
  events,
  date,
  hasManualEvent,
  hasLeaveEvent,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative focus:outline-none">
          <div
            className={cn(
              "h-8 w-8 p-1 grid place-content-center rounded-full cursor-pointer transition-colors text-sm font-medium",
              hasManualEvent
                ? "bg-red-500 text-white hover:bg-red-600"
                : "bg-slate-200 text-slate-600 border hover:bg-black hover:text-white dark:hover:bg-slate-500"
            )}
          >
            {date}
          </div>
          {events.length > 1 && (
            <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center pointer-events-none">
              {events.length}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="center"
        avoidCollisions={true}
        collisionPadding={12}
        className="w-48 p-2 shadow-lg z-50"
      >
        <div className="flex flex-col gap-2 text-xs">
          {events.map((event) => (
            <div
              key={event.id}
              className="border-b last:border-0 pb-2 last:pb-0"
            >
              <div className="flex items-center gap-1 mb-0.5">
                <span
                  className={cn(
                    "w-2 h-2 rounded-full flex-shrink-0",
                    isLeaveEvent(event.title) ? "bg-slate-400" : "bg-red-500"
                  )}
                />
                <p className="font-medium">{event.title}</p>
              </div>
              <p className="text-muted-foreground pl-3">{event.description}</p>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}