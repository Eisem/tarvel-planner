import { io } from "socket.io-client";

export const socket = io("http://localhost:3001", { autoConnect: false });

export function joinRoomRealtime(roomCode: string, memberId: string) {
  if (!socket.connected) socket.connect();
  socket.emit("room.join", { roomCode, memberId });
}
