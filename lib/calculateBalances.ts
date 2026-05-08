import { Balances } from "@prisma/client";
import prisma from "@/lib/prisma";

export default async function calculateAndUpdateBalances(
  email: string,
  year: string,
  type: string,
  days: number  // for SHORT this value is hours
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

    case "SICK":
      balanceUpdate = {
        sickUsed:      (balance.sickUsed as number) + days,
        sickAvailable: (balance.sickCredit as number) - ((balance.sickUsed as number) + days),
      };
      break;

    case "PERSONAL":
      balanceUpdate = {
        personalUsed:      (balance.personalUsed as number) + days,
        personalAvailable: (balance.personalCredit as number) - ((balance.personalUsed as number) + days),
      };
      break;

    case "MATERNITY":
      balanceUpdate = {
        maternityUsed:      (balance.maternityUsed as number) + days,
        maternityAvailable: (balance.maternityCredit as number) - ((balance.maternityUsed as number) + days),
      };
      break;

    case "SPECIAL":
      balanceUpdate = {
        specialUsed:      (balance.specialUsed as number) + days,
        specialAvailable: (balance.specialCredit as number) - ((balance.specialUsed as number) + days),
      };
      break;

    case "SHORT":
      // `days` is actually hours here — convert to day fraction (8 hrs = 1 day)
      // Deducted from PERSONAL balance, and raw hours tracked in shortUsed
      const dayFraction = days / 8;
      balanceUpdate = {
        personalUsed:      (balance.personalUsed as number) + dayFraction,
        personalAvailable: (balance.personalCredit as number) - ((balance.personalUsed as number) + dayFraction),
        shortUsed:         (balance.shortUsed ?? 0) + days,
      };
      break;

    default:
      throw new Error(`Unsupported leave type: ${type}`);
  }

  await prisma.balances.update({
    where: { id: balance.id },
    data: balanceUpdate,
  });
}