import { Route, Routes, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { api } from "./services/api";
import { WorkbenchPage } from "./features/workbench/WorkbenchPage";
import { VotingPage } from "./features/voting/VotingPage";
import type { ReactNode } from "react";

const quickStats = [
  { label: "地图共创", value: "所有候选地点在同一张图上讨论，空间关系一眼看懂。" },
  { label: "拖拽排程", value: "按天编排路线，随时调整顺序，不用反复复制粘贴。" },
  { label: "投票定稿", value: "一键推送候选方案，团队投票后直接收敛到最终版本。" }
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

  useEffect(() => {
    document.body.classList.add("home-lock-scroll");
    return () => {
      document.body.classList.remove("home-lock-scroll");
    };
  }, []);

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
      const normalizedNickname = nickname.trim();
      const data = await api.createRoom({ nickname: normalizedNickname, roomName: roomName.trim() || undefined });
      nav(`/rooms/${data.roomCode}/workbench?memberId=${data.memberId}&nickname=${encodeURIComponent(normalizedNickname)}`);
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
      const normalizedNickname = nickname.trim();
      const data = await api.joinRoom({ roomCode: roomCode.trim().toUpperCase(), nickname: normalizedNickname });
      nav(`/rooms/${data.roomCode}/workbench?memberId=${data.memberId}&nickname=${encodeURIComponent(normalizedNickname)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加入失败，请检查房间码");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <main className="landing-dashboard">
        <section className="landing-content">
          <section className="hero">
          <motion.p className="tag" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
            TRIP PLANNER COLLAB
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.08 }}>
            用共享地图和投票流程，
            <br />
            把旅行想法变成可执行行程
          </motion.h1>
          <motion.p className="subline" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.12 }}>
            从收集地点、编排日程到全员投票，围绕同一套数据协作，减少沟通损耗，提升决策效率。
          </motion.p>
          <div className="stat-grid">
            {quickStats.map((item, index) => (
              <motion.article
                key={item.label}
                className="stat-card"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.18 + index * 0.07 }}
              >
                <p>{item.label}</p>
                <strong>{item.value}</strong>
              </motion.article>
            ))}
          </div>
          </section>

          <motion.section className="action-row" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.28 }}>
            <button className="action-card" onClick={() => openModal("create")}>
            <span className="action-icon">+</span>
            <strong>新建协作空间</strong>
            <small>作为组织者创建房间并发起路线设计</small>
            </button>

            <button className="action-card" onClick={() => openModal("join")}>
            <span className="action-icon">→</span>
            <strong>进入已有空间</strong>
            <small>输入房间码，继续团队协同编排</small>
            </button>
          </motion.section>
        </section>
      </main>

      {modal ? (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeModal}>×</button>

            <h2>{modal === "create" ? "创建新空间" : "加入协作空间"}</h2>
            <p className="modal-desc">
              {modal === "create" ? "填写身份后即可开启多人规划" : "输入房间码快速进入团队会话"}
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
                  placeholder="例如：北京三日游"
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
      <Route path="/rooms/:roomCode/vote" element={<VotingPage />} />
    </Routes>
  );
}
