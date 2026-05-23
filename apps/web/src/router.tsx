import { Link, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { api } from "./services/api";
import { MarkMapPanel } from "./features/map/MarkMapPanel";
import type { ReactNode } from "react";

const roomTabs = [
  { key: "mark", label: "个人标点", desc: "收集想去地点" },
  { key: "map", label: "全员地图", desc: "查看汇总与聚合" },
  { key: "plans", label: "行程规划", desc: "拖拽安排时间" },
  { key: "vote", label: "方案投票", desc: "票选最终方案" }
];

const quickStats = [
  { label: "房间协作", value: "实时同步" },
  { label: "地图标点", value: "POI + 手动" },
  { label: "决策机制", value: "一人一票" }
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
      nav(`/rooms/${data.roomCode}/mark?memberId=${data.memberId}`);
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
      const data = await api.joinRoom({ roomCode, nickname });
      nav(`/rooms/${data.roomCode}/mark?memberId=${data.memberId}`);
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
            从地图收集想去地点，到日程拖拽编排，再到方案投票，全部在一个房间里实时协作完成。
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

function RoomNav() {
  const { roomCode } = useParams();
  return (
    <header className="room-header">
      <div>
        <p className="room-code">房间码：{roomCode}</p>
        <h1>旅行协同工作台</h1>
      </div>
      <Link className="back-link" to="/">
        返回首页
      </Link>
      <nav className="tab-nav">
        {roomTabs.map((tab) => (
          <NavLink key={tab.key} className={({ isActive }) => (isActive ? "tab active" : "tab")} to={`/rooms/${roomCode}/${tab.key}`}>
            <strong>{tab.label}</strong>
            <span>{tab.desc}</span>
          </NavLink>
        ))}
      </nav>
    </header>
  );
}

function PlaceholderCard({ title, desc, items }: { title: string; desc: string; items: string[] }) {
  return (
    <article className="feature-card">
      <h3>{title}</h3>
      <p>{desc}</p>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}

function MarkPage() {
  const { roomCode } = useParams();
  const [search] = useSearchParams();
  const memberId = search.get("memberId") ?? "";
  return (
    <AppShell>
      <section className="room-page">
        <RoomNav />
        <div className="content-grid">
          <PlaceholderCard
            title="个人标点"
            desc="搜索地点或地图点击后，补充预算、目的、时长，沉淀个人旅行意向。"
            items={["关键词地点搜索", "点击地图添加地点", "标点编辑弹窗（预算/备注）", "我的标点列表"]}
          />
          <article className="map-preview large">
            {roomCode ? <MarkMapPanel roomCode={roomCode} memberId={memberId} /> : null}
          </article>
        </div>
        <footer className="page-note">当前房间：{roomCode}。建议先完成地点采集，再进入全员地图聚合。</footer>
      </section>
    </AppShell>
  );
}

function MapPage() {
  return (
    <AppShell>
      <section className="room-page">
        <RoomNav />
        <div className="content-grid">
          <PlaceholderCard
            title="全员标点汇总"
            desc="房间内所有成员标点统一展示，同地点聚合后可以查看多人留言。"
            items={["成员筛选", "预算筛选", "优先级筛选", "聚合点详情抽屉"]}
          />
          <article className="map-preview large">
            <div className="map-placeholder">
              <p>聚合地图区域</p>
              <small>支持成员颜色区分、同地点聚合数字徽标</small>
            </div>
          </article>
        </div>
      </section>
    </AppShell>
  );
}

function PlanPage() {
  return (
    <AppShell>
      <section className="room-page">
        <RoomNav />
        <div className="tri-grid">
          <PlaceholderCard title="地点池" desc="从全员标点中挑选候选地点，拖拽进日程表进行安排。" items={["全部地点", "仅看我的", "未安排", "高优先级"]} />
          <PlaceholderCard title="周日程" desc="基于时间轴安排每天行程，支持移动与调整时长。" items={["拖拽创建", "调整开始/结束时间", "冲突提示", "自动排序"]} />
          <PlaceholderCard title="路线预览" desc="按当天计划顺序连线，直观看到动线是否合理。" items={["按天分组连线", "颜色区分 Day1/Day2", "预算统计", "方案备注"]} />
        </div>
      </section>
    </AppShell>
  );
}

function VotePage() {
  return (
    <AppShell>
      <section className="room-page">
        <RoomNav />
        <div className="content-grid">
          <PlaceholderCard
            title="候选方案"
            desc="每位成员可查看候选行程方案详情，并选择最认可的一版。"
            items={["方案卡片对比", "一人一票可改票", "并列第一提示", "房主确认最终方案"]}
          />
          <article className="feature-card">
            <h3>投票结果面板</h3>
            <p>实时刷新票数，自动标记最高票方案，便于团队快速决策。</p>
            <ol>
              <li>方案 A - 3 票（当前第一）</li>
              <li>方案 B - 2 票</li>
              <li>方案 C - 1 票</li>
            </ol>
          </article>
        </div>
      </section>
    </AppShell>
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
