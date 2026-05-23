export type RoomStatus = "MARKING" | "PLANNING" | "VOTING" | "FINISHED";
export type MemberRole = "OWNER" | "MEMBER";
export type Priority = "LOW" | "MEDIUM" | "HIGH";
export type TransportMode = "WALK" | "TAXI" | "BUS" | "DRIVE";

export interface Room {
  id: string;
  code: string;
  name?: string;
  status: RoomStatus;
  timezone: string;
  createdByMemberId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Member {
  id: string;
  roomId: string;
  nickname: string;
  color: string;
  role: MemberRole;
  joinedAt: string;
}

export interface Marker {
  id: string;
  roomId: string;
  memberId: string;
  placeName: string;
  poiId?: string;
  placeKey: string;
  lng: number;
  lat: number;
  address?: string;
  budget?: number;
  purpose?: string;
  expectedDurationMinutes?: number;
  priority: Priority;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Plan {
  id: string;
  roomId: string;
  creatorMemberId: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlanItem {
  id: string;
  planId: string;
  markerId: string;
  dayIndex: number;
  startTime: string;
  endTime: string;
  orderIndex: number;
  transportMode: TransportMode;
  note?: string;
  version: number;
}

export interface Vote {
  id: string;
  roomId: string;
  planId: string;
  memberId: string;
  createdAt: string;
  updatedAt: string;
}
