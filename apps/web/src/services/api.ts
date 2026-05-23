const API_BASE = "http://localhost:3001/api/v1";

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
  }
};
