import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { api } from "../services/api";
import "./HomePage.css";

const features = [
  {
    title: "地图共创",
    desc: "所有候选地点在同一张图上讨论，空间关系一眼看懂。",
    tone: "blue",
    icon: "map"
  },
  {
    title: "拖拽排程",
    desc: "按天编排路线，随时调整顺序，不用反复复制粘贴。",
    tone: "green",
    icon: "calendar"
  },
  {
    title: "投票定稿",
    desc: "一键推送候选方案，团队投票后直接收敛到最终版本。",
    tone: "orange",
    icon: "vote"
  }
];

const places = [
  { name: "海滩日落", votes: "多人收藏 · 4票", tone: "ocean", pos: "place-top" },
  { name: "老城漫步", votes: "多人收藏 · 3票", tone: "city", pos: "place-mid" },
  { name: "在地美食", votes: "多人收藏 · 5票", tone: "food", pos: "place-bottom" }
];

const actions = [
  {
    title: "新建协作空间",
    desc: "作为组织者创建房间并发起路线设计",
    tone: "blue",
    icon: "create"
  },
  {
    title: "进入已有空间",
    desc: "输入房间码，继续团队协同编排",
    tone: "green",
    icon: "join"
  }
];

function Icon({ kind }: { kind: "map" | "calendar" | "vote" }) {
  if (kind === "map") {
    return <svg viewBox="0 0 24 24"><path d="M3 6.5 8.5 4l7 2.5L21 4v13.5L15.5 20l-7-2.5L3 20V6.5Zm5.5-2.1v13.1m7-10.9v13.1" /></svg>;
  }
  if (kind === "calendar") {
    return <svg viewBox="0 0 24 24"><path d="M7 3v3m10-3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm2.5 9 2.3 2.2L15.5 12" /></svg>;
  }
  return <svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9h-9V3Zm1 0v8h8A9 9 0 0 0 13 3Z" /></svg>;
}

function ActionIcon({ kind }: { kind: "create" | "join" }) {
  if (kind === "create") {
    return <svg viewBox="0 0 24 24"><path d="M3 16 12 6l9 10M5 16h14M8 16v3h8v-3M17 8l2-2M17 6h2v2" /></svg>;
  }
  return <svg viewBox="0 0 24 24"><path d="M4 20h11a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H4m7 8h10m-4-4 4 4-4 4" /></svg>;
}

function MapPreview() {
  return (
    <div className="map-preview">
      <svg className="map-lines" viewBox="0 0 660 430" preserveAspectRatio="none">
        <path d="M20 340 C150 250 240 320 350 220 C470 112 560 150 640 90" />
        <path d="M50 390 C170 300 280 350 390 260 C500 170 580 185 652 130" />
        <path d="M160 310 C230 278 280 188 360 176 C425 165 500 115 546 102" className="route" />
      </svg>
      <span className="pin pin-blue" />
      <span className="pin pin-green" />
      <span className="pin pin-orange" />

      {places.map((place, index) => (
        <motion.article
          key={place.name}
          className={`place-card ${place.pos}`}
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 4 + index * 0.8, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className={`place-avatar ${place.tone}`} />
          <div>
            <p>{place.name}</p>
            <small>{place.votes}</small>
          </div>
        </motion.article>
      ))}
    </div>
  );
}

export function HomePage() {
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
    <div className="home-page">
      <header className="top-nav">
        <div className="brand">TRIP PLANNER</div>
      </header>

      <main className="home-shell">
        <section className="hero-grid">
          <motion.div className="hero-copy" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
            <p className="badge">TRIP PLANNER COLLAB</p>
            <h1>
              用共享地图和投票流程，
              <br />
              把旅行想法变成
              <span className="highlight">可执行行程</span>
            </h1>
            <p className="sub">
              从收集地点、编排日程到全员投票，围绕同一套数据协作，
              减少沟通损耗，提升决策效率。
            </p>
          </motion.div>
          <MapPreview />
        </section>

        <section className="feature-grid">
          {features.map((feature) => (
            <motion.article key={feature.title} className={`feature-card ${feature.tone}`} whileHover={{ y: -6 }}>
              <div className="feature-icon"><Icon kind={feature.icon as "map" | "calendar" | "vote"} /></div>
              <h3>{feature.title}</h3>
              <p>{feature.desc}</p>
            </motion.article>
          ))}
        </section>

        <section className="action-grid">
          {actions.map((action) => (
            <motion.button
              key={action.title}
              className={`action-card ${action.tone}`}
              whileHover={{ y: -6 }}
              onClick={() => openModal(action.tone === "blue" ? "create" : "join")}
            >
              <div className="action-art"><ActionIcon kind={action.icon as "create" | "join"} /></div>
              <div className="action-text">
                <h4>{action.title}</h4>
                <p>{action.desc}</p>
              </div>
              <span className="arrow">→</span>
            </motion.button>
          ))}
        </section>
      </main>

      {modal ? (
        <div className="home-modal-overlay" onClick={closeModal}>
          <div className="home-modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="home-modal-close" onClick={closeModal}>×</button>

            <h2>{modal === "create" ? "创建新空间" : "加入协作空间"}</h2>
            <p className="home-modal-desc">
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

            {error ? <p className="home-modal-error">{error}</p> : null}

            <button
              className="home-modal-submit"
              disabled={loading || !nickname.trim() || (modal === "join" && !roomCode.trim())}
              onClick={modal === "create" ? handleCreate : handleJoin}
            >
              {loading ? "处理中..." : modal === "create" ? "立即创建" : "加入房间"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
