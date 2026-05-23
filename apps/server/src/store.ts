import { PrismaClient, Prisma, type Priority, type RoomStatus, type TransportMode } from "@prisma/client";

const COLORS = ["#ef4444", "#22c55e", "#3b82f6", "#eab308", "#f97316", "#a855f7"];

let colorIdx = 0;

export const prisma = new PrismaClient();

function createCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function toNumber(v: Prisma.Decimal | number) {
  return typeof v === "number" ? v : Number(v);
}

export async function createRoom(roomName: string | undefined, nickname: string, timezone = "Asia/Shanghai") {
  const code = createCode();
  const color = COLORS[colorIdx++ % COLORS.length];

  return prisma.$transaction(async (tx) => {
    const room = await tx.room.create({
      data: {
        code,
        name: roomName,
        timezone
      }
    });

    const member = await tx.member.create({
      data: {
        roomId: room.id,
        nickname,
        color,
        role: "OWNER"
      }
    });

    const updatedRoom = await tx.room.update({
      where: { id: room.id },
      data: { createdByMemberId: member.id }
    });

    return { room: updatedRoom, member };
  });
}

export async function getRoomByCode(code: string) {
  return prisma.room.findUnique({ where: { code: code.toUpperCase() } });
}

export async function joinRoom(code: string, nickname: string): Promise<{ room: Prisma.RoomGetPayload<{}>; member: Prisma.MemberGetPayload<{}> } | { error: "NICKNAME_CONFLICT" } | null> {
  const room = await getRoomByCode(code);
  if (!room) return null;

  try {
    const member = await prisma.member.create({
      data: {
        roomId: room.id,
        nickname,
        color: COLORS[colorIdx++ % COLORS.length],
        role: "MEMBER"
      }
    });
    return { room, member };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "NICKNAME_CONFLICT" };
    }
    throw error;
  }
}

export async function transitionRoomStatus(roomId: string, status: RoomStatus) {
  return prisma.room.update({ where: { id: roomId }, data: { status } });
}

type MarkerInput = {
  roomId: string;
  memberId: string;
  placeName: string;
  poiId?: string;
  lng: number;
  lat: number;
  address?: string;
  budget?: number;
  purpose?: string;
  expectedDurationMinutes?: number;
  priority?: Priority;
  note?: string;
};

export async function createMarker(input: MarkerInput) {
  const marker = await prisma.marker.create({
    data: {
      ...input,
      placeKey: input.poiId ? `poi:${input.poiId}` : `geo:${input.lng.toFixed(4)},${input.lat.toFixed(4)}`,
      lng: new Prisma.Decimal(input.lng),
      lat: new Prisma.Decimal(input.lat),
      priority: input.priority ?? "MEDIUM"
    }
  });
  return {
    ...marker,
    lng: toNumber(marker.lng),
    lat: toNumber(marker.lat)
  };
}

export async function listMarkers(roomId: string, memberId?: string) {
  const rows = await prisma.marker.findMany({
    where: { roomId, ...(memberId ? { memberId } : {}) },
    orderBy: { createdAt: "desc" }
  });
  return rows.map((m) => ({ ...m, lng: toNumber(m.lng), lat: toNumber(m.lat) }));
}

export async function updateMarker(markerId: string, patch: Partial<MarkerInput>) {
  const existing = await prisma.marker.findUnique({ where: { id: markerId } });
  if (!existing) {
    throw new Error("MARKER_NOT_FOUND");
  }
  const data: Prisma.MarkerUpdateInput = {
    ...patch,
    ...(patch.lng !== undefined ? { lng: new Prisma.Decimal(patch.lng) } : {}),
    ...(patch.lat !== undefined ? { lat: new Prisma.Decimal(patch.lat) } : {})
  };
  if (patch.poiId !== undefined || patch.lng !== undefined || patch.lat !== undefined) {
    const lng = patch.lng ?? toNumber(existing.lng);
    const lat = patch.lat ?? toNumber(existing.lat);
    data.placeKey = patch.poiId ? `poi:${patch.poiId}` : `geo:${lng.toFixed(4)},${lat.toFixed(4)}`;
  }
  const marker = await prisma.marker.update({ where: { id: markerId }, data });
  return { ...marker, lng: toNumber(marker.lng), lat: toNumber(marker.lat) };
}

export async function getMarkerById(markerId: string) {
  const marker = await prisma.marker.findUnique({ where: { id: markerId } });
  if (!marker) return null;
  return { ...marker, lng: toNumber(marker.lng), lat: toNumber(marker.lat) };
}

export async function createPlan(roomId: string, creatorMemberId: string, title: string, description?: string) {
  return prisma.plan.create({
    data: { roomId, creatorMemberId, title, description }
  });
}

export async function listPlans(roomId: string) {
  return prisma.plan.findMany({ where: { roomId }, orderBy: { createdAt: "desc" } });
}

export async function getPlanById(planId: string) {
  return prisma.plan.findUnique({ where: { id: planId } });
}

type PlanItemInput = {
  planId: string;
  markerId: string;
  dayIndex: number;
  startTime: string;
  endTime: string;
  orderIndex: number;
  transportMode: TransportMode;
  note?: string;
};

export async function createPlanItem(input: PlanItemInput) {
  return prisma.planItem.create({
    data: {
      ...input,
      startTime: new Date(input.startTime),
      endTime: new Date(input.endTime)
    }
  });
}

export async function getPlanItemById(id: string) {
  return prisma.planItem.findUnique({ where: { id } });
}

export async function updatePlanItem(id: string, patch: Partial<PlanItemInput>) {
  return prisma.planItem.update({
    where: { id },
    data: {
      ...patch,
      ...(patch.startTime ? { startTime: new Date(patch.startTime) } : {}),
      ...(patch.endTime ? { endTime: new Date(patch.endTime) } : {}),
      version: { increment: 1 }
    }
  });
}

export async function vote(roomId: string, planId: string, memberId: string) {
  return prisma.vote.upsert({
    where: { planId_memberId: { planId, memberId } },
    update: {},
    create: { roomId, planId, memberId }
  });
}

export async function unvote(planId: string, memberId: string) {
  return prisma.vote.delete({
    where: { planId_memberId: { planId, memberId } }
  });
}

export async function listVotes(roomId: string, memberId?: string) {
  return prisma.vote.findMany({ where: { roomId, ...(memberId ? { memberId } : {}) } });
}

export async function listMembers(roomId: string) {
  return prisma.member.findMany({ where: { roomId }, orderBy: { joinedAt: "asc" } });
}
