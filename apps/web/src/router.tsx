import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { api } from "./services/api";

function HomePage() {
  const nav = useNavigate();
  const [nickname, setNickname] = useState("Mary");
  const [roomCode, setRoomCode] = useState("");
  const [loading, setLoading] = useState(false);

  async function createRoom() {
    setLoading(true);
    const data = await api.createRoom({ nickname });
    setLoading(false);
    nav(`/rooms/${data.roomCode}/mark?memberId=${data.memberId}`);
  }

  async function joinRoom() {
    setLoading(true);
    const data = await api.joinRoom({ roomCode, nickname });
    setLoading(false);
    nav(`/rooms/${data.roomCode}/mark?memberId=${data.memberId}`);
  }

  return (
    <main className="page">
      <h1>Trip Planner</h1>
      <p>Collaborative room, map markers, plans, and voting.</p>
      <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Nickname" />
      <div className="row">
        <button disabled={loading} onClick={createRoom}>Create Room</button>
      </div>
      <div className="row">
        <input value={roomCode} onChange={(e) => setRoomCode(e.target.value)} placeholder="Room Code" />
        <button disabled={loading} onClick={joinRoom}>Join Room</button>
      </div>
    </main>
  );
}

function RoomNav() {
  const { roomCode } = useParams();
  return (
    <nav className="row">
      <Link to={`/rooms/${roomCode}/mark`}>Mark</Link>
      <Link to={`/rooms/${roomCode}/map`}>Map</Link>
      <Link to={`/rooms/${roomCode}/plans`}>Plans</Link>
      <Link to={`/rooms/${roomCode}/vote`}>Vote</Link>
    </nav>
  );
}

function MarkPage() {
  const { roomCode } = useParams();
  return (
    <section className="page">
      <RoomNav />
      <h2>Mark Places ({roomCode})</h2>
      <p>Map integration placeholder. Next step: AMap + marker editor modal.</p>
    </section>
  );
}

function MapPage() {
  return (
    <section className="page">
      <RoomNav />
      <h2>Aggregated Map</h2>
      <p>Marker grouping and aggregated popup placeholder.</p>
    </section>
  );
}

function PlanPage() {
  return (
    <section className="page">
      <RoomNav />
      <h2>Plan Schedule</h2>
      <p>Calendar drag-and-drop placeholder.</p>
    </section>
  );
}

function VotePage() {
  return (
    <section className="page">
      <RoomNav />
      <h2>Vote</h2>
      <p>Plan ranking and vote actions placeholder.</p>
    </section>
  );
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/rooms/:roomCode/mark" element={<MarkPage />} />
      <Route path="/rooms/:roomCode/map" element={<MapPage />} />
      <Route path="/rooms/:roomCode/plans" element={<PlanPage />} />
      <Route path="/rooms/:roomCode/vote" element={<VotePage />} />
    </Routes>
  );
}
