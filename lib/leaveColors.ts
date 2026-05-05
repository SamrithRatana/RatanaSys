export const leaveTypeColors = {
  ANNUAL:    { bg: "bg-blue-100",   text: "text-blue-800",   dot: "bg-blue-500" },
  SICK:      { bg: "bg-red-100",    text: "text-red-800",    dot: "bg-red-500" },
  PERSONAL:  { bg: "bg-purple-100", text: "text-purple-800", dot: "bg-purple-500" },
  MATERNITY: { bg: "bg-pink-100",   text: "text-pink-800",   dot: "bg-pink-500" },
  SPECIAL:   { bg: "bg-amber-100",  text: "text-amber-800",  dot: "bg-amber-500" },
} as const;

export type LeaveType = keyof typeof leaveTypeColors;

export const getLeaveColor = (type: string) =>
  leaveTypeColors[type as LeaveType] ?? {
    bg: "bg-slate-100",
    text: "text-slate-700",
    dot: "bg-slate-400",
  };