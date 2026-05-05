import { leaveTypeColors, LeaveType } from "@/lib/leaveColors";

const CalendarLegend = () => (
  <div className="flex flex-wrap gap-3 px-4 pb-4 pt-2">
    {(Object.keys(leaveTypeColors) as LeaveType[]).map((type) => {
      const color = leaveTypeColors[type];
      return (
        <div key={type} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${color.dot}`} />
          <span className="text-xs text-muted-foreground">
            {type.charAt(0) + type.slice(1).toLowerCase()}
          </span>
        </div>
      );
    })}
  </div>
);

export default CalendarLegend;