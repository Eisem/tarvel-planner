import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { z } from "zod";
import {
  createMarker,
  createPlan,
  createPlanItem,
  createRoom,
  getMarkerById,
  getPlanById,
  getPlanItemById,
  getRoomByCode,
  joinRoom,
  listMarkers,
  listMembers,
  listPlans,
  listVotes,
  prisma,
  transitionRoomStatus,
  unvote,
  updateMarker,
  updatePlanItem,
  vote
} from "./store.js";
import type { RoomStatus } from "./types.js";

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

function ok(data: unknown) {
  return { code: "OK", message: "success", data, requestId: crypto.randomUUID() };
}

function fail(code: string, message: string) {
  return { code, message, data: null, requestId: crypto.randomUUID() };
}

function roomChannel(roomCode: string) {
  return `room:${roomCode}`;
}

io.on("connection", (socket) => {
  socket.on("room.join", ({ roomCode }) => {
    socket.join(roomChannel(String(roomCode)));
  });
});

app.post("/api/v1/rooms", async (req, res) => {
  const schema = z.object({ roomName: z.string().min(1).max(50).optional(), nickname: z.string().min(1).max(24), timezone: z.string().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(fail("VALIDATION_ERROR", parsed.error.message));
  const { room, member } = await createRoom(parsed.data.roomName, parsed.data.nickname, parsed.data.timezone);
  res.json(ok({ roomId: room.id, roomCode: room.code, roomStatus: room.status, timezone: room.timezone, memberId: member.id, memberRole: member.role, memberToken: member.id }));
});

app.post("/api/v1/rooms/join", async (req, res) => {
  const schema = z.object({ roomCode: z.string().min(6).max(12), nickname: z.string().min(1).max(24) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(fail("VALIDATION_ERROR", parsed.error.message));
  const result = await joinRoom(parsed.data.roomCode, parsed.data.nickname);
  if (!result) return res.status(404).json(fail("ROOM_NOT_FOUND", "room does not exist"));
  if ("error" in result) return res.status(409).json(fail(result.error, "nickname already exists"));
  io.to(roomChannel(result.room.code)).emit("member.joined", { memberId: result.member.id, nickname: result.member.nickname });
  res.json(ok({ roomId: result.room.id, roomCode: result.room.code, roomStatus: result.room.status, timezone: result.room.timezone, memberId: result.member.id, memberRole: result.member.role, memberToken: result.member.id }));
});

app.get("/api/v1/rooms/:roomCode", async (req, res) => {
  const room = await getRoomByCode(req.params.roomCode);
  if (!room) return res.status(404).json(fail("ROOM_NOT_FOUND", "room does not exist"));
  res.json(ok(room));
});

app.patch("/api/v1/rooms/:roomCode/status", async (req, res) => {
  const parsed = z.object({ toStatus: z.enum(["MARKING", "PLANNING", "VOTING", "FINISHED"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(fail("VALIDATION_ERROR", parsed.error.message));
  const room = await getRoomByCode(req.params.roomCode);
  if (!room) return res.status(404).json(fail("ROOM_NOT_FOUND", "room does not exist"));
  const updated = await transitionRoomStatus(room.id, parsed.data.toStatus as RoomStatus);
  res.json(ok(updated));
});

app.get("/api/v1/rooms/:roomCode/members", async (req, res) => {
  const room = await getRoomByCode(req.params.roomCode);
  if (!room) return res.status(404).json(fail("ROOM_NOT_FOUND", "room does not exist"));
  const members = await listMembers(room.id);
  res.json(ok(members.map((m) => ({ ...m, online: false }))));
});

app.post("/api/v1/rooms/:roomId/markers", async (req, res) => {
  const parsed = z.object({ memberId: z.string().min(1), placeName: z.string().min(1), poiId: z.string().optional(), lng: z.number(), lat: z.number(), address: z.string().optional(), budget: z.number().optional(), purpose: z.string().optional(), expectedDurationMinutes: z.number().optional(), priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(), note: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(fail("VALIDATION_ERROR", parsed.error.message));
  const room = await prisma.room.findUnique({ where: { id: req.params.roomId } });
  if (!room) return res.status(404).json(fail("ROOM_NOT_FOUND", "room does not exist"));
  const marker = await createMarker({ roomId: req.params.roomId, ...parsed.data });
  io.to(roomChannel(room.code)).emit("marker.created", marker);
  res.status(201).json(ok(marker));
});

app.get("/api/v1/rooms/:roomId/markers", async (req, res) => {
  const memberId = req.query.memberId?.toString();
  const rows = await listMarkers(req.params.roomId, memberId);
  res.json(ok(rows));
});

app.patch("/api/v1/markers/:markerId", async (req, res) => {
  const marker = await getMarkerById(req.params.markerId);
  if (!marker) return res.status(404).json(fail("MARKER_NOT_FOUND", "marker not found"));
  const parsed = z.object({ placeName: z.string().optional(), budget: z.number().optional(), purpose: z.string().optional(), expectedDurationMinutes: z.number().optional(), priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(), note: z.string().optional(), lng: z.number().optional(), lat: z.number().optional(), poiId: z.string().optional(), address: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(fail("VALIDATION_ERROR", parsed.error.message));
  const updated = await updateMarker(req.params.markerId, parsed.data);
  const room = await prisma.room.findUnique({ where: { id: marker.roomId } });
  if (room) io.to(roomChannel(room.code)).emit("marker.updated", updated);
  res.json(ok(updated));
});

app.post("/api/v1/rooms/:roomId/plans", async (req, res) => {
  const parsed = z.object({ creatorMemberId: z.string().min(1), title: z.string().min(1), description: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(fail("VALIDATION_ERROR", parsed.error.message));
  const room = await prisma.room.findUnique({ where: { id: req.params.roomId } });
  if (!room) return res.status(404).json(fail("ROOM_NOT_FOUND", "room does not exist"));
  const plan = await createPlan(req.params.roomId, parsed.data.creatorMemberId, parsed.data.title, parsed.data.description);
  io.to(roomChannel(room.code)).emit("plan.created", plan);
  res.status(201).json(ok(plan));
});

app.get("/api/v1/rooms/:roomId/plans", async (req, res) => {
  const plans = await listPlans(req.params.roomId);
  res.json(ok(plans));
});

app.get("/api/v1/plans/:planId/items", async (req, res) => {
  const plan = await getPlanById(req.params.planId);
  if (!plan) return res.status(404).json(fail("PLAN_NOT_FOUND", "plan not found"));
  const items = await prisma.planItem.findMany({ where: { planId: req.params.planId }, orderBy: [{ dayIndex: "asc" }, { orderIndex: "asc" }] });
  res.json(ok(items));
});

app.post("/api/v1/plans/:planId/items", async (req, res) => {
  const parsed = z.object({ markerId: z.string().min(1), dayIndex: z.number().int().min(1), startTime: z.string(), endTime: z.string(), orderIndex: z.number().int().default(1), transportMode: z.enum(["WALK", "TAXI", "BUS", "DRIVE"]).default("WALK"), note: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(fail("VALIDATION_ERROR", parsed.error.message));
  const plan = await getPlanById(req.params.planId);
  if (!plan) return res.status(404).json(fail("PLAN_NOT_FOUND", "plan not found"));
  const item = await createPlanItem({ planId: req.params.planId, ...parsed.data });
  const room = await prisma.room.findUnique({ where: { id: plan.roomId } });
  if (room) io.to(roomChannel(room.code)).emit("planItem.created", item);
  res.status(201).json(ok(item));
});

app.patch("/api/v1/plan-items/:id", async (req, res) => {
  const item = await getPlanItemById(req.params.id);
  if (!item) return res.status(404).json(fail("PLAN_ITEM_NOT_FOUND", "plan item not found"));
  const parsed = z.object({ dayIndex: z.number().int().min(1).optional(), startTime: z.string().optional(), endTime: z.string().optional(), orderIndex: z.number().int().optional(), transportMode: z.enum(["WALK", "TAXI", "BUS", "DRIVE"]).optional(), note: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(fail("VALIDATION_ERROR", parsed.error.message));
  const updated = await updatePlanItem(req.params.id, parsed.data);
  const plan = await getPlanById(item.planId);
  if (plan) {
    const room = await prisma.room.findUnique({ where: { id: plan.roomId } });
    if (room) io.to(roomChannel(room.code)).emit("planItem.updated", updated);
  }
  res.json(ok(updated));
});

app.post("/api/v1/plans/:planId/vote", async (req, res) => {
  const parsed = z.object({ memberId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(fail("VALIDATION_ERROR", parsed.error.message));
  const plan = await getPlanById(req.params.planId);
  if (!plan) return res.status(404).json(fail("PLAN_NOT_FOUND", "plan not found"));
  const entity = await vote(plan.roomId, req.params.planId, parsed.data.memberId);
  const room = await prisma.room.findUnique({ where: { id: plan.roomId } });
  if (room) io.to(roomChannel(room.code)).emit("vote.updated", { roomId: plan.roomId });
  res.status(201).json(ok(entity));
});

app.delete("/api/v1/plans/:planId/vote", async (req, res) => {
  const parsed = z.object({ memberId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(fail("VALIDATION_ERROR", parsed.error.message));
  const plan = await getPlanById(req.params.planId);
  if (!plan) return res.status(404).json(fail("PLAN_NOT_FOUND", "plan not found"));
  try {
    await unvote(req.params.planId, parsed.data.memberId);
  } catch {
    // already unvoted - fine
  }
  const room = await prisma.room.findUnique({ where: { id: plan.roomId } });
  if (room) io.to(roomChannel(room.code)).emit("vote.updated", { roomId: plan.roomId });
  res.json(ok({ success: true }));
});

app.get("/api/v1/rooms/:roomId/my-votes", async (req, res) => {
  const memberId = req.query.memberId?.toString();
  if (!memberId) return res.status(400).json(fail("VALIDATION_ERROR", "memberId query required"));
  const votes = await listVotes(req.params.roomId, memberId);
  res.json(ok(votes.map((v) => v.planId)));
});

app.get("/api/v1/rooms/:roomId/vote-result", async (req, res) => {
  const plans = await listPlans(req.params.roomId);
  const votes = await listVotes(req.params.roomId);
  const members = await listMembers(req.params.roomId);
  const memberCount = members.length;
  const countByPlan = new Map<string, number>();
  votes.forEach((v) => countByPlan.set(v.planId, (countByPlan.get(v.planId) ?? 0) + 1));
  const max = Math.max(0, ...countByPlan.values());
  const bestIds = new Set([...countByPlan.entries()].filter(([, c]) => c === max && c > 0).map(([id]) => id));
  res.json(ok({ memberCount, plans: plans.map((p) => ({ planId: p.id, title: p.title, voteCount: countByPlan.get(p.id) ?? 0, isBest: bestIds.has(p.id), isTied: bestIds.size > 1 && bestIds.has(p.id) })) }));
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json(fail("INTERNAL_ERROR", "unhandled server error"));
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`server listening on http://localhost:${PORT}`);
});
