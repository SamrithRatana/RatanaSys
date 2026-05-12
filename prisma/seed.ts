import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ── Roles ──────────────────────────────────────────
  const roles = [
    { label: "ADMIN",     description: "Full system access" },
    { label: "MODERATOR", description: "Can approve leaves and view reports" },
    { label: "USER",      description: "Standard employee access" },
  ];
  for (const r of roles) {
    await prisma.role.upsert({ where: { label: r.label }, update: {}, create: r });
  }

  // ── Departments ────────────────────────────────────
  const departments = [
    { label: "Accounting & Cashier", description: "Handles accounting and cashier operations" },
    { label: "Admin & Stock",        description: "Manages administration and stock" },
    { label: "Delivery",             description: "Handles delivery operations" },
    { label: "IT",                   description: "Manages information technology" },
    { label: "Marketing",            description: "Manages marketing and promotions" },
    { label: "Technical",            description: "Handles technical operations" },
  ];
  for (const d of departments) {
    await prisma.department.upsert({ where: { label: d.label }, update: {}, create: d });
  }

  // ── Job Titles ─────────────────────────────────────
  const titles = [
    { label: "CEO",                      description: "Chief Executive Officer" },
    { label: "Senior Developer",         description: "Develops software" },
    { label: "Human Resources Manager",  description: "Deals with human matters" },
    { label: "Operations Manager",       description: "Runs operations" },
    { label: "Product Owner",            description: "Manages product development" },
  ];
  for (const t of titles) {
    await prisma.jobTitle.upsert({ where: { label: t.label }, update: {}, create: t });
  }

  console.log("✅ Seed complete");
}

main().catch(console.error).finally(() => prisma.$disconnect());