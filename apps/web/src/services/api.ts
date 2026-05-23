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
    return req<Array<{ id: string; placeName: string; lng: number; lat: number; note?: string; budget?: number }>>(`/rooms/${roomId}/markers`);
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
  }
};
