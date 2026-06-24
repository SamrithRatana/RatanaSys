import { Balances } from "@prisma/client";
import prisma from "@/lib/prisma";

function inferMaternityCredit(used: number, currentCredit: number): number {
  if (currentCredit > 0) return currentCredit;
  if (used <= 7) return 7;
  return 90;
}

// ─────────────────────────────────────────────────────────────────────────────
// calculateAndUpdateBalances
//
// Called when a leave is approved. Updates the DB `Used` and `Available` fields.
//
// IMPORTANT: This function reads the CURRENT DB value and adds `days` on top.
// But the display (getBalanceData) always recomputes from approved leaves,
// so the DB Used field is only used as a running counter for audit purposes.
// The displayed values will always match approved leave records.
// ─────────────────────────────────────────────────────────────────────────────
export default async function calculateAndUpdateBalances(
  email: string,
  year:  string,
  type:  string,
  days:  number  // for SHORT, SICK_SHORT, ANNUAL_SHORT this is hours not days
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
      const newUsed = (balance.annualUsed as number) + days;
      balanceUpdate = {
        annualUsed:      newUsed,
        annualAvailable: (balance.annualCredit as number) - newUsed,
      };
      break;
    }

    case "ANNUAL_SHORT": {
      const fraction  = days / 8;
      const newUsed   = (balance.annualUsed as number) + fraction;
      balanceUpdate = {
        annualUsed:      newUsed,
        annualAvailable: (balance.annualCredit as number) - newUsed,
      };
      break;
    }

    case "SICK": {
      const newUsed = (balance.sickUsed as number) + days;
      balanceUpdate = {
        sickUsed:      newUsed,
        sickAvailable: (balance.sickCredit as number) - newUsed,
      };
      break;
    }

    case "SICK_SHORT": {
      const fraction = days / 8;
      const newUsed  = (balance.sickUsed as number) + fraction;
      balanceUpdate = {
        sickUsed:      newUsed,
        sickAvailable: (balance.sickCredit as number) - newUsed,
      };
      break;
    }

    case "PERSONAL": {
      const newUsed = (balance.personalUsed as number) + days;
      balanceUpdate = {
        personalUsed:      newUsed,
        personalAvailable: (balance.personalCredit as number) - newUsed,
      };
      break;
    }

    case "MATERNITY": {
      const existingCredit = balance.maternityCredit as number;
      const existingUsed   = balance.maternityUsed   as number;
      const healedCredit   = inferMaternityCredit(existingUsed + days, existingCredit);
      const newUsed        = existingUsed + days;
      balanceUpdate = {
        maternityCredit:    healedCredit,
        maternityUsed:      newUsed,
        maternityAvailable: Math.max(0, healedCredit - newUsed),
      };
      break;
    }

    case "SPECIAL": {
      const newUsed = (balance.specialUsed as number) + days;
      balanceUpdate = {
        specialUsed:      newUsed,
        specialAvailable: (balance.specialCredit as number) - newUsed,
      };
      break;
    }

    case "SHORT": {
      const fraction = days / 8;
      const newPersonalUsed = (balance.personalUsed as number) + fraction;
      balanceUpdate = {
        personalUsed:      newPersonalUsed,
        personalAvailable: (balance.personalCredit as number) - newPersonalUsed,
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