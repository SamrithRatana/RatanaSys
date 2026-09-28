import prisma from "@/lib/prisma";
import { addDaysYmd, holidayYmds } from "@/lib/leaveRules";

/**
 * Company holidays (events added by admins in Settings) between two dates,
 * as a set of yyyy-MM-dd strings in the company timezone.
 */
export async function getHolidaySet(fromYmd: string, toYmd: string): Promise<Set<string>> {
  // Pad a day each side: admin events are stored at local midnight (17:00Z the day before)
  const from = new Date(`${addDaysYmd(fromYmd, -1)}T00:00:00.000Z`);
  const to   = new Date(`${addDaysYmd(toYmd, 1)}T23:59:59.999Z`);

  const events = await prisma.events.findMany({
    where: {
      leaveId: null,
      OR: [
        { startDate: { gte: from, lte: to } },
        { startDate: { lte: to }, endDate: { gte: from } },
      ],
    },
    select: { title: true, startDate: true, endDate: true, leaveId: true },
  });

  return new Set(holidayYmds(events).filter((d) => d >= fromYmd && d <= toYmd));
}
