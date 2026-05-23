/*
  Warnings:

  - A unique constraint covering the columns `[planId,memberId]` on the table `Vote` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Vote_roomId_memberId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Vote_planId_memberId_key" ON "Vote"("planId", "memberId");
