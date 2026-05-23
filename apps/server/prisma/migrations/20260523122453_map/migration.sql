-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('MARKING', 'PLANNING', 'VOTING', 'FINISHED');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "TransportMode" AS ENUM ('WALK', 'TAXI', 'BUS', 'DRIVE');

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "status" "RoomStatus" NOT NULL DEFAULT 'MARKING',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "createdByMemberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Marker" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "placeName" TEXT NOT NULL,
    "poiId" TEXT,
    "placeKey" TEXT NOT NULL,
    "lng" DECIMAL(10,7) NOT NULL,
    "lat" DECIMAL(10,7) NOT NULL,
    "address" TEXT,
    "budget" INTEGER,
    "purpose" TEXT,
    "expectedDurationMinutes" INTEGER,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Marker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "creatorMemberId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "markerId" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "transportMode" "TransportMode" NOT NULL DEFAULT 'WALK',
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Room_code_key" ON "Room"("code");

-- CreateIndex
CREATE INDEX "Member_roomId_idx" ON "Member"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_roomId_nickname_key" ON "Member"("roomId", "nickname");

-- CreateIndex
CREATE INDEX "Marker_roomId_idx" ON "Marker"("roomId");

-- CreateIndex
CREATE INDEX "Marker_roomId_placeKey_idx" ON "Marker"("roomId", "placeKey");

-- CreateIndex
CREATE INDEX "Marker_memberId_idx" ON "Marker"("memberId");

-- CreateIndex
CREATE INDEX "Plan_roomId_idx" ON "Plan"("roomId");

-- CreateIndex
CREATE INDEX "Plan_creatorMemberId_idx" ON "Plan"("creatorMemberId");

-- CreateIndex
CREATE INDEX "PlanItem_planId_idx" ON "PlanItem"("planId");

-- CreateIndex
CREATE INDEX "PlanItem_planId_dayIndex_startTime_idx" ON "PlanItem"("planId", "dayIndex", "startTime");

-- CreateIndex
CREATE INDEX "Vote_roomId_idx" ON "Vote"("roomId");

-- CreateIndex
CREATE INDEX "Vote_planId_idx" ON "Vote"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_roomId_memberId_key" ON "Vote"("roomId", "memberId");

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Marker" ADD CONSTRAINT "Marker_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Marker" ADD CONSTRAINT "Marker_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_creatorMemberId_fkey" FOREIGN KEY ("creatorMemberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_markerId_fkey" FOREIGN KEY ("markerId") REFERENCES "Marker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
