/*
  Warnings:

  - A unique constraint covering the columns `[email,year]` on the table `Balances` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Balances_email_year_key" ON "Balances"("email", "year");
