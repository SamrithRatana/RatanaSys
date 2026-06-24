import { Balances } from "@prisma/client";
import prisma from "@/lib/prisma";

function inferMaternityCredit(used: number, currentCredit: number): number {
  if (currentCredit > 0) return currentCredit;
  if (used <= 7) return 7;
  return 90;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export default async function calculateAndUpdateBalances(
  email: string,
  year:  string,
  type:  string,
  days:  number  // for SHORT, SICK_SHORT, ANNUAL_SHORT this value is hours
): Promise<void> {
  const balance = await prisma.balances.findFirst({
    where: { email, year },
  });

  if (!balance) {
    throw new Error(`Balance not found for ${email} / ${year}`);
  }

  let balanceUpdate: Partial<Balances> = {};

  switch (type.toUpperCase()) {

    case "ANNUAL": {
      const newUsed = round2((balance.annualUsed as number) + days);
      balanceUpdate = {
        annualUsed:      newUsed,
        annualAvailable: round2((balance.annualCredit as number) - newUsed),
      };
      break;
    }

    case "ANNUAL_SHORT": {
      const newUsed = round2((balance.annualUsed as number) + days / 8);
      balanceUpdate = {
        annualUsed:      newUsed,
        annualAvailable: round2((balance.annualCredit as number) - newUsed),
      };
      break;
    }

    case "SICK": {
      const newUsed = round2((balance.sickUsed as number) + days);
      balanceUpdate = {
        sickUsed:      newUsed,
        sickAvailable: round2((balance.sickCredit as number) - newUsed),
      };
      break;
    }

    case "SICK_SHORT": {
      const newUsed = round2((balance.sickUsed as number) + days / 8);
      balanceUpdate = {
        sickUsed:      newUsed,
        sickAvailable: round2((balance.sickCredit as number) - newUsed),
      };
      break;
    }

    case "PERSONAL": {
      const newUsed = round2((balance.personalUsed as number) + days);
      balanceUpdate = {
        personalUsed:      newUsed,
        personalAvailable: round2((balance.personalCredit as number) - newUsed),
      };
      break;
    }

    case "MATERNITY": {
      const existingCredit = balance.maternityCredit as number;
      const existingUsed   = balance.maternityUsed   as number;
      const healedCredit   = inferMaternityCredit(existingUsed + days, existingCredit);
      const newUsed        = round2(existingUsed + days);
      balanceUpdate = {
        maternityCredit:    healedCredit,
        maternityUsed:      newUsed,
        maternityAvailable: round2(Math.max(0, healedCredit - newUsed)),
      };
      break;
    }

    case "SPECIAL": {
      const newUsed = round2((balance.specialUsed as number) + days);
      balanceUpdate = {
        specialUsed:      newUsed,
        specialAvailable: round2((balance.specialCredit as number) - newUsed),
      };
      break;
    }

    case "SHORT": {
      const fraction        = round2(days / 8);
      const newPersonalUsed = round2((balance.personalUsed as number) + fraction);
      balanceUpdate = {
        personalUsed:      newPersonalUsed,
        personalAvailable: round2((balance.personalCredit as number) - newPersonalUsed),
        shortUsed:         round2((balance.shortUsed ?? 0) + days),
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