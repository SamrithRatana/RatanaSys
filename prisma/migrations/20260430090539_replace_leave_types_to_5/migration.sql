/*
  Warnings:

  - You are about to drop the column `familyAvailable` on the `Balances` table. All the data in the column will be lost.
  - You are about to drop the column `familyCredit` on the `Balances` table. All the data in the column will be lost.
  - You are about to drop the column `familyUsed` on the `Balances` table. All the data in the column will be lost.
  - You are about to drop the column `healthAvailable` on the `Balances` table. All the data in the column will be lost.
  - You are about to drop the column `healthCredit` on the `Balances` table. All the data in the column will be lost.
  - You are about to drop the column `healthUsed` on the `Balances` table. All the data in the column will be lost.
  - You are about to drop the column `paternityAvailable` on the `Balances` table. All the data in the column will be lost.
  - You are about to drop the column `paternityCredit` on the `Balances` table. All the data in the column will be lost.
  - You are about to drop the column `paternityUsed` on the `Balances` table. All the data in the column will be lost.
  - You are about to drop the column `studyAvailable` on the `Balances` table. All the data in the column will be lost.
  - You are about to drop the column `studyCredit` on the `Balances` table. All the data in the column will be lost.
  - You are about to drop the column `studyUsed` on the `Balances` table. All the data in the column will be lost.
  - You are about to drop the column `unpaidUsed` on the `Balances` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Balances" DROP COLUMN "familyAvailable",
DROP COLUMN "familyCredit",
DROP COLUMN "familyUsed",
DROP COLUMN "healthAvailable",
DROP COLUMN "healthCredit",
DROP COLUMN "healthUsed",
DROP COLUMN "paternityAvailable",
DROP COLUMN "paternityCredit",
DROP COLUMN "paternityUsed",
DROP COLUMN "studyAvailable",
DROP COLUMN "studyCredit",
DROP COLUMN "studyUsed",
DROP COLUMN "unpaidUsed",
ADD COLUMN     "personalAvailable" INTEGER DEFAULT 0,
ADD COLUMN     "personalCredit" INTEGER DEFAULT 0,
ADD COLUMN     "personalUsed" INTEGER DEFAULT 0,
ADD COLUMN     "sickAvailable" INTEGER DEFAULT 0,
ADD COLUMN     "sickCredit" INTEGER DEFAULT 0,
ADD COLUMN     "sickUsed" INTEGER DEFAULT 0,
ADD COLUMN     "specialAvailable" INTEGER DEFAULT 0,
ADD COLUMN     "specialCredit" INTEGER DEFAULT 0,
ADD COLUMN     "specialUsed" INTEGER DEFAULT 0;
