import { Link, Route, Routes, useNavigate } from "react-router-dom";
import { useState } from "react";
import { api } from "./services/api";
import { WorkbenchPage } from "./features/workbench/WorkbenchPage";
import type { ReactNode } from "react";

const quickStats = [
  { label: "房间协作", value: "实时同步" },
  { label: "地图标点", value: "POI + 手动" },
  { label: "决策机制", value: "共享快照 + 推送" }
];

function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-bg">
      <div className="orb orb-a" />
      <div className="orb orb-b" />
      <div className="shell">{children}</div>
    </div>
  );
}

function HomePage() {
  const nav = useNavigate();
  const [nickname, setNickname] = useState("小海");
  const [roomName, setRoomName] = useState("东京自由行");
  const [roomCode, setRoomCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function createRoom() {
    try {
      setLoading(true);
      setError("");
      const data = await api.createRoom({ nickname, roomName });
      nav(`/rooms/${data.roomCode}/workbench?memberId=${data.memberId}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "创建失败";
      setError(`创建房间失败：${message}`);
    } finally {
      setLoading(false);
    }
  }

  async function joinRoom() {
    try {
      setLoading(true);
      setError("");
      const data = await api.joinRoom({ roomCode: roomCode.toUpperCase(), nickname });
      nav(`/rooms/${data.roomCode}/workbench?memberId=${data.memberId}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "加入失败";
      setError(`加入房间失败：${message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <main className="landing">
        <section className="hero">
          <p className="tag">多人旅游协同系统</p>
          <h1>一起把旅行计划从聊天记录变成可执行方案</h1>
          <p className="subline">
            地图标点实时同步、方案快照 + 拖拽排程、推送共享与协作编辑，全部在一个工作台完成。
          </p>
          <div className="stat-grid">
            {quickStats.map((item) => (
              <article key={item.label} className="stat-card">
                <p>{item.label}</p>
                <strong>{item.value}</strong>
              </article>
            ))}
          </div>
        </section>

        <section className="panel-grid">
          <article className="panel">
            <h2>创建房间</h2>
            <p>发起新的旅行协作空间，邀请成员加入。</p>
            <label>
              <span>你的昵称</span>
              <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="请输入昵称" />
            </label>
            <label>
              <span>房间名称</span>
              <input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="例如：东京自由行" />
            </label>
            <button className="btn btn-primary" disabled={loading} onClick={createRoom}>
              {loading ? "创建中..." : "立即创建"}
            </button>
          </article>

          <article className="panel">
            <h2>加入房间</h2>
            <p>已有房间码？直接加入协作。</p>
            <label>
              <span>你的昵称</span>
              <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="请输入昵称" />
            </label>
            <label>
              <span>房间码</span>
              <input value={roomCode} onChange={(e) => setRoomCode(e.target.value.toUpperCase())} placeholder="例如：A8K21P" />
            </label>
            <button className="btn" disabled={loading} onClick={joinRoom}>
              {loading ? "加入中..." : "加入房间"}
            </button>
          </article>
        </section>

        {error ? <p className="error-text">{error}</p> : null}
      </main>
    </AppShell>
  );
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/rooms/:roomCode/workbench" element={<WorkbenchPage />} />
    </Routes>
  );
}
