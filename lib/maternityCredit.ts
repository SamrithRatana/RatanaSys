import prisma from "@/lib/prisma";
import { MATERNITY_DAYS } from "@/lib/leaveRules";

/** Make sure the employee's balance for `year` carries a maternity/paternity credit. */
export async function ensureMaternityCredit(
  userEmail:  string,
  userName:   string,
  year:       string,
  gender:     "MALE" | "FEMALE",
  canCreate:  boolean,
) {
  const creditDays = MATERNITY_DAYS[gender];
  const existing   = await prisma.balances.findUnique({
    where: { email_year: { email: userEmail, year } },
  });
  if (existing && !((existing.maternityCredit ?? 0) > 0)) {
    await prisma.balances.update({
      where: { id: existing.id },
      data:  { maternityCredit: creditDays, maternityAvailable: creditDays - (existing.maternityUsed ?? 0) },
    });
  } else if (!existing && canCreate) {
    await prisma.balances.create({
      data: {
        email: userEmail, name: userName, year,
        maternityCredit: creditDays, maternityAvailable: creditDays,
      },
    });
  }
}
