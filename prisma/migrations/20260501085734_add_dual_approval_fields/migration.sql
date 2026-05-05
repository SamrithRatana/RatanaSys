/*
  Warnings:

  - You are about to drop the column `moderator` on the `Leave` table. All the data in the column will be lost.
  - You are about to drop the column `moderatorNote` on the `Leave` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Leave" DROP COLUMN "moderator",
DROP COLUMN "moderatorNote",
ADD COLUMN     "headDepartment" TEXT,
ADD COLUMN     "headDepartmentApproved" BOOLEAN DEFAULT false,
ADD COLUMN     "headDepartmentAt" TIMESTAMP(3),
ADD COLUMN     "headDepartmentNote" TEXT,
ADD COLUMN     "manager" TEXT,
ADD COLUMN     "managerApproved" BOOLEAN DEFAULT false,
ADD COLUMN     "managerAt" TIMESTAMP(3),
ADD COLUMN     "managerNote" TEXT;
