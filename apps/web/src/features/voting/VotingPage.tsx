import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../services/api";
import { joinRoomRealtime, leaveRoomRealtime, socket } from "../../services/socket";

type PlanInfo = {
  id: string;
  title: string;
  creatorMemberId: string;
};

type VoteResult = {
  planId: string;
  title: string;
  voteCount: number;
  isBest: boolean;
  isTied: boolean;
};

export function VotingPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const [search] = useSearchParams();
  const queryMemberId = search.get("memberId") ?? "";

  const [memberId, setMemberId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [voteResults, setVoteResults] = useState<VoteResult[]>([]);
  const [memberCount, setMemberCount] = useState(0);

  const refreshPlansAndVotes = useCallback(async (targetRoomId: string, mid: string) => {
    const [planList, myVotes, result] = await Promise.all([
      api.listPlans(targetRoomId),
      api.listMyVotes(targetRoomId, mid),
      api.getVoteResult(targetRoomId)
    ]);
    setPlans(planList.map((p) => ({ id: p.id, title: p.title, creatorMemberId: p.creatorMemberId })));
    setStarredIds(new Set(myVotes));
    setVoteResults(result.plans);
    setMemberCount(result.memberCount);
  }, []);

  useEffect(() => {
    const storageKey = roomCode ? `tp_member_${roomCode}` : "";
    if (queryMemberId) {
      localStorage.setItem(storageKey, queryMemberId);
      setMemberId(queryMemberId);
    } else {
      setMemberId(localStorage.getItem(storageKey) ?? "");
    }
  }, [queryMemberId, roomCode]);

  useEffect(() => {
    let disposed = false;
    (async () => {
      if (!roomCode) return;
      try {
        const room = await api.getRoom(roomCode);
        if (disposed) return;
        setRoomId(room.id);
        await refreshPlansAndVotes(room.id, memberId || queryMemberId);
      } catch (e) {
        if (!disposed) setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (!disposed) setLoading(false);
      }
    })();
    return () => { disposed = true; };
  }, [roomCode, memberId, queryMemberId, refreshPlansAndVotes]);

  useEffect(() => {
    if (!roomCode || !memberId) return;

    joinRoomRealtime(roomCode, memberId);
    const onVoteUpdated = () => {
      if (roomId) refreshPlansAndVotes(roomId, memberId);
    };
    const onPlanCreated = () => {
      if (roomId) refreshPlansAndVotes(roomId, memberId);
    };

    socket.on("vote.updated", onVoteUpdated);
    socket.on("plan.created", onPlanCreated);

    return () => {
      socket.off("vote.updated", onVoteUpdated);
      socket.off("plan.created", onPlanCreated);
      leaveRoomRealtime(roomCode, memberId);
    };
  }, [memberId, roomCode, roomId, refreshPlansAndVotes]);

  async function toggleStar(planId: string) {
    if (!memberId) return;
    try {
      if (starredIds.has(planId)) {
        await api.unvotePlan(planId, { memberId });
        setStarredIds((prev) => {
          const next = new Set(prev);
          next.delete(planId);
          return next;
        });
      } else {
        await api.votePlan(planId, { memberId });
        setStarredIds((prev) => new Set(prev).add(planId));
      }
      // refresh vote results
      if (roomId) {
        const result = await api.getVoteResult(roomId);
        setVoteResults(result.plans);
        setMemberCount(result.memberCount);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    }
  }

  const sortedResults = useMemo(
    () => [...voteResults].sort((a, b) => b.voteCount - a.voteCount),
    [voteResults]
  );

  return (
    <div className="app-bg vote-shell">
      <div className="orb orb-a" />
      <div className="orb orb-b" />

      <header className="wb-header">
        <div>
          <p className="room-code">房间码：{roomCode}</p>
          <h1>方案投票</h1>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link className="btn" to={`/rooms/${roomCode}/workbench?memberId=${memberId}`}>返回工作台</Link>
          <Link className="btn" to="/">返回首页</Link>
        </div>
      </header>

      {loading ? <p className="page-note wb-message">加载中...</p> : null}
      {error ? <p className="error-text wb-message">{error}</p> : null}

      <div className="vote-layout">
        <main className="vote-main">
          <h2>共享方案列表</h2>
          {plans.length === 0 ? (
            <p className="page-note">暂无共享方案，请先在工作台中推送方案。</p>
          ) : (
            <div className="vote-plan-list">
              {plans.map((plan) => {
                const starred = starredIds.has(plan.id);
                return (
                  <article key={plan.id} className={`vote-plan-card${starred ? " starred" : ""}`}>
                    <div className="vote-plan-info">
                      <strong>{plan.title}</strong>
                      <small>创建者：{plan.creatorMemberId}</small>
                    </div>
                    <button
                      className={`star-btn${starred ? " active" : ""}`}
                      onClick={() => toggleStar(plan.id)}
                      title={starred ? "取消点赞" : "点赞"}
                    >
                      <svg width="28" height="28" viewBox="0 0 24 24" fill={starred ? "#f59e0b" : "none"} stroke={starred ? "#f59e0b" : "#94a3b8"} strokeWidth="2">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </main>

        <aside className="vote-leaderboard">
          <h2>排行榜</h2>
          <p className="page-note">房间共 {memberCount} 人</p>
          <div className="leaderboard-list">
            {sortedResults.map((vr) => {
              const ratio = memberCount > 0 ? vr.voteCount / memberCount : 0;
              const pct = Math.round(ratio * 100);
              const waterHeight = Math.min(100, Math.max(0, pct));
              return (
                <div key={vr.planId} className={`leaderboard-item${vr.isBest ? " best" : ""}`}>
                  <div className="droplet-wrapper">
                    <div className="droplet">
                      <div
                        className="droplet-fill"
                        style={{ height: `${waterHeight}%` }}
                      />
                      <div className="droplet-shine" />
                    </div>
                    <span className="droplet-pct">{pct}%</span>
                  </div>
                  <div className="leaderboard-info">
                    <strong>{vr.title}</strong>
                    <small>{vr.voteCount} 人点赞</small>
                    {vr.isBest && !vr.isTied && <span className="best-badge">最佳</span>}
                    {vr.isTied && <span className="tie-badge">并列</span>}
                  </div>
                </div>
              );
            })}
            {sortedResults.length === 0 && (
              <p className="page-note">暂无投票数据</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
