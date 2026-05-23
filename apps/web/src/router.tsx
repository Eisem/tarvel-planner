import { Route, Routes, useNavigate } from "react-router-dom";
import { useState } from "react";
import { api } from "./services/api";
import { WorkbenchPage } from "./features/workbench/WorkbenchPage";
import type { ReactNode } from "react";

const quickStats = [
  { label: "看得见的共识", value: "每个人的意愿都落在地图上，而不是淹没在消息里。" },
  { label: "改得动的方案", value: "快照分支编辑，不满意就重排，满意再推送。" },
  { label: "复用式协作", value: "别人方案一键另存，改完再发，团队决策不断迭代。" }
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
  const [modal, setModal] = useState<"create" | "join" | null>(null);
  const [nickname, setNickname] = useState("");
  const [roomName, setRoomName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function openModal(type: "create" | "join") {
    setNickname("");
    setRoomName("");
    setRoomCode("");
    setError("");
    setModal(type);
  }

  function closeModal() {
    setModal(null);
    setError("");
  }

  async function handleCreate() {
    if (!nickname.trim()) return;
    try {
      setLoading(true);
      setError("");
      const data = await api.createRoom({ nickname: nickname.trim(), roomName: roomName.trim() || undefined });
      nav(`/rooms/${data.roomCode}/workbench?memberId=${data.memberId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (!nickname.trim() || !roomCode.trim()) return;
    try {
      setLoading(true);
      setError("");
      const data = await api.joinRoom({ roomCode: roomCode.trim().toUpperCase(), nickname: nickname.trim() });
      nav(`/rooms/${data.roomCode}/workbench?memberId=${data.memberId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加入失败，请检查房间码");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <main className="landing">
        <section className="hero">
          <p className="tag">协同决策系统</p>
          <h1>把"群聊做攻略"升级为"协同做决策"</h1>
          <p className="subline">
            多人地图标注 + 方案拖拽排程 + 共享迭代，3 分钟产出可执行旅行计划。
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

        <section className="action-row">
          <button className="action-card" onClick={() => openModal("create")}>
            <span className="action-icon">+</span>
            <strong>创建协作房间</strong>
            <small>发起新行程，邀请队友一起规划</small>
          </button>

          <button className="action-card" onClick={() => openModal("join")}>
            <span className="action-icon">→</span>
            <strong>加入现有房间</strong>
            <small>输入房间码，立即参与共创</small>
          </button>
        </section>
      </main>

      {modal ? (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeModal}>×</button>

            <h2>{modal === "create" ? "创建协作房间" : "加入现有房间"}</h2>
            <p className="modal-desc">
              {modal === "create" ? "发起一个新的旅行协作空间" : "输入房间码加入已有协作"}
            </p>

            <label>
              <span>你的昵称</span>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="输入昵称"
                autoFocus
              />
            </label>

            {modal === "create" ? (
              <label>
                <span>房间名称（可选）</span>
                <input
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="例如：东京自由行"
                />
              </label>
            ) : (
              <label>
                <span>房间码</span>
                <input
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="例如：A8K21P"
                />
              </label>
            )}

            {error ? <p className="error-text" style={{ margin: 0 }}>{error}</p> : null}

            <button
              className="btn btn-primary"
              disabled={loading || !nickname.trim() || (modal === "join" && !roomCode.trim())}
              onClick={modal === "create" ? handleCreate : handleJoin}
            >
              {loading ? "处理中..." : modal === "create" ? "立即创建" : "加入房间"}
            </button>
          </div>
        </div>
      ) : null}
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
