import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:3001";

export const socket = io(SOCKET_URL, { autoConnect: false });

export function joinRoomRealtime(roomCode: string, memberId: string) {
  if (!socket.connected) socket.connect();
  socket.emit("room.join", { roomCode, memberId });
}

export function leaveRoomRealtime(roomCode: string, memberId: string) {
  if (!socket.connected) return;
  socket.emit("room.leave", { roomCode, memberId });
}
