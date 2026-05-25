import { Balances } from "@prisma/client";
import prisma from "@/lib/prisma";

const MATERNITY_DAYS: Record<string, number> = {
  MALE:   7,
  FEMALE: 90,
};

function inferMaternityCredit(used: number, currentCredit: number): number {
  if (currentCredit > 0) return currentCredit;
  if (used <= 7)  return 7;
  return 90;
}

export default async function calculateAndUpdateBalances(
  email: string,
  year:  string,
  type:  string,
  days:  number  // for SHORT, SICK_SHORT, and ANNUAL_SHORT this value is hours
): Promise<void> {
  const balance = await prisma.balances.findFirst({
    where: { email, year },
  });

  if (!balance) {
    throw new Error("Balance not found for the specified user and year");
  }

  let balanceUpdate: Partial<Balances> = {};

  switch (type.toUpperCase()) {
    case "ANNUAL":
      balanceUpdate = {
        annualUsed:      (balance.annualUsed as number) + days,
        annualAvailable: (balance.annualCredit as number) - ((balance.annualUsed as number) + days),
      };
      break;

    // Partial-day annual leave — `days` param carries hours, deduct as fraction of a day
    case "ANNUAL_SHORT": {
      const dayFraction   = days / 8;
      const newAnnualUsed = (balance.annualUsed as number) + dayFraction;
      balanceUpdate = {
        annualUsed:      newAnnualUsed,
        annualAvailable: (balance.annualCredit as number) - newAnnualUsed,
      };
      break;
    }

    case "SICK":
      balanceUpdate = {
        sickUsed:      (balance.sickUsed as number) + days,
        sickAvailable: (balance.sickCredit as number) - ((balance.sickUsed as number) + days),
      };
      break;

    // Partial-day sick leave — `days` param carries hours, deduct as fraction
    case "SICK_SHORT": {
      const dayFraction  = days / 8;
      const newSickUsed  = (balance.sickUsed as number) + dayFraction;
      balanceUpdate = {
        sickUsed:      newSickUsed,
        sickAvailable: (balance.sickCredit as number) - newSickUsed,
      };
      break;
    }

    case "PERSONAL":
      balanceUpdate = {
        personalUsed:      (balance.personalUsed as number) + days,
        personalAvailable: (balance.personalCredit as number) - ((balance.personalUsed as number) + days),
      };
      break;

    case "MATERNITY": {
      const existingCredit = balance.maternityCredit as number;
      const existingUsed   = balance.maternityUsed   as number;
      const healedCredit   = inferMaternityCredit(existingUsed + days, existingCredit);

      const newUsed      = existingUsed + days;
      const newAvailable = healedCredit - newUsed;

      balanceUpdate = {
        maternityCredit:    healedCredit,
        maternityUsed:      newUsed,
        maternityAvailable: Math.max(0, newAvailable),
      };
      break;
    }

    case "SPECIAL":
      balanceUpdate = {
        specialUsed:      (balance.specialUsed as number) + days,
        specialAvailable: (balance.specialCredit as number) - ((balance.specialUsed as number) + days),
      };
      break;

    case "SHORT": {
      const dayFraction = days / 8;
      balanceUpdate = {
        personalUsed:      (balance.personalUsed as number) + dayFraction,
        personalAvailable: (balance.personalCredit as number) - ((balance.personalUsed as number) + dayFraction),
        shortUsed:         (balance.shortUsed ?? 0) + days,
      };
      break;
    }

    default:
      throw new Error(`Unsupported leave type: ${type}`);
  }

  await prisma.balances.update({
    where: { id: balance.id },
    data:  balanceUpdate,
  });
}