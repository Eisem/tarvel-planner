const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001/api/v1";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message ?? "request failed");
  }
  return data.data as T;
}

export type MarkerRow = {
  id: string;
  placeName: string;
  lng: number;
  lat: number;
  note?: string;
  budget?: number;
};

export type PlanRow = {
  id: string;
  roomId: string;
  creatorMemberId: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type PlanItemRow = {
  id: string;
  planId: string;
  markerId: string;
  dayIndex: number;
  startTime: string;
  endTime: string;
  orderIndex: number;
  transportMode: string;
  note?: string;
  version: number;
};

export const api = {
  createRoom(payload: { roomName?: string; nickname: string }) {
    return req<{ roomCode: string; memberId: string }>("/rooms", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  joinRoom(payload: { roomCode: string; nickname: string }) {
    return req<{ roomCode: string; memberId: string }>("/rooms/join", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  getRoom(roomCode: string) {
    return req<{ id: string; code: string; name?: string; status: string; timezone: string }>(`/rooms/${roomCode}`);
  },
  listMarkers(roomId: string) {
    return req<MarkerRow[]>(`/rooms/${roomId}/markers`);
  },
  createMarker(roomId: string, payload: {
    memberId: string;
    placeName: string;
    lng: number;
    lat: number;
    poiId?: string;
    address?: string;
    budget?: number;
    purpose?: string;
    expectedDurationMinutes?: number;
    priority?: "LOW" | "MEDIUM" | "HIGH";
    note?: string;
  }) {
    return req(`/rooms/${roomId}/markers`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  listPlans(roomId: string) {
    return req<PlanRow[]>(`/rooms/${roomId}/plans`);
  },
  createPlan(roomId: string, payload: { creatorMemberId: string; title: string; description?: string }) {
    return req<PlanRow>(`/rooms/${roomId}/plans`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  listPlanItems(planId: string) {
    return req<PlanItemRow[]>(`/plans/${planId}/items`);
  },
  createPlanItem(planId: string, payload: {
    markerId: string;
    dayIndex: number;
    startTime: string;
    endTime: string;
    orderIndex?: number;
    transportMode?: string;
    note?: string;
  }) {
    return req<PlanItemRow>(`/plans/${planId}/items`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  updatePlanItem(id: string, payload: {
    dayIndex?: number;
    startTime?: string;
    endTime?: string;
    orderIndex?: number;
    note?: string;
  }) {
    return req<PlanItemRow>(`/plan-items/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  },
  votePlan(planId: string, payload: { memberId: string }) {
    return req(`/plans/${planId}/vote`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  unvotePlan(planId: string, payload: { memberId: string }) {
    return req(`/plans/${planId}/vote`, {
      method: "DELETE",
      body: JSON.stringify(payload)
    });
  },
  listMyVotes(roomId: string, memberId: string) {
    return req<string[]>(`/rooms/${roomId}/my-votes?memberId=${memberId}`);
  },
  getVoteResult(roomId: string) {
    return req<{ memberCount: number; plans: Array<{ planId: string; title: string; voteCount: number; isBest: boolean; isTied: boolean }> }>(`/rooms/${roomId}/vote-result`);
  }
};
