import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";
import { Events } from "@prisma/client";

type Props = {
  events: Events[];
  date: number;
  hasManualEvent: boolean; // ← manual event = red circle
  hasLeaveEvent: boolean;  // ← leave event  = gray circle
};

const isLeaveEvent = (title: string) =>
  /\bon\s+\w.*Leave\b/i.test(title);

export default function EventPopOver({ events, date, hasManualEvent, hasLeaveEvent }: Props) {
  return (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>
            <div className="relative">
              <h1
                className={cn(
                  "h-8 w-8 p-1 grid place-content-center rounded-full cursor-pointer transition-colors",
                  // ✅ Red for manual events, gray for leave-only days
                  hasManualEvent
                    ? "bg-red-500 text-white hover:bg-red-600"
                    : "bg-slate-200 text-slate-600 border hover:bg-black hover:text-white dark:hover:bg-slate-500"
                )}
              >
                {date}
              </h1>
              {/* ✅ Count badge for multiple events */}
              {events.length > 1 && (
                <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">
                  {events.length}
                </span>
              )}
            </div>
          </NavigationMenuTrigger>

          <NavigationMenuContent className="shadow-lg">
            <div className="flex flex-col w-44 p-2 gap-2 text-xs">
              {events.map((event) => (
                <div
                  key={event.id}
                  className={cn(
                    "border-b last:border-0 pb-2 last:pb-0",
                  )}
                >
                  {/* ✅ Red dot for manual events, gray for leave */}
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className={cn(
                      "w-2 h-2 rounded-full flex-shrink-0",
                      isLeaveEvent(event.title) ? "bg-slate-400" : "bg-red-500"
                    )} />
                    <p className="font-medium">{event.title}</p>
                  </div>
                  <p className="text-muted-foreground pl-3">{event.description}</p>
                </div>
              ))}
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}