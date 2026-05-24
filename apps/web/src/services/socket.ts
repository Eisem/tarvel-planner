import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:3001";

export const socket = io(SOCKET_URL, { autoConnect: false });

let _currentRoomCode = "";
let _currentMemberId = "";

socket.on("connect", () => {
  if (_currentRoomCode && _currentMemberId) {
    socket.emit("room.join", { roomCode: _currentRoomCode, memberId: _currentMemberId });
  }
});

export function joinRoomRealtime(roomCode: string, memberId: string) {
  _currentRoomCode = roomCode;
  _currentMemberId = memberId;
  if (!socket.connected) socket.connect();
  else socket.emit("room.join", { roomCode, memberId });
}

export function leaveRoomRealtime(roomCode: string, memberId: string) {
  _currentRoomCode = "";
  _currentMemberId = "";
  if (!socket.connected) return;
  socket.emit("room.leave", { roomCode, memberId });
}
