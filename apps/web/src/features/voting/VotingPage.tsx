import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { api } from "../../services/api";
import type { MarkerRow, PlanItemRow } from "../../services/api";
import { joinRoomRealtime, leaveRoomRealtime, socket } from "../../services/socket";
import { MapCanvas } from "../map/MapCanvas";
import { createDraft, loadDrafts, saveDrafts } from "../snapshot/snapshotStore";
import type { DraftSnapshot } from "../snapshot/snapshotStore";

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
  const [markers, setMarkers] = useState<MarkerRow[]>([]);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const [modalPlanId, setModalPlanId] = useState("");
  const [modalPlanTitle, setModalPlanTitle] = useState("");
  const [modalMarkers, setModalMarkers] = useState<MarkerRow[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const mapInstanceRef = useRef<unknown>(null);

  const refreshPlansAndVotes = useCallback(async (targetRoomId: string, mid: string) => {
    const [planList, myVotes, result, markerList] = await Promise.all([
      api.listPlans(targetRoomId),
      api.listMyVotes(targetRoomId, mid),
      api.getVoteResult(targetRoomId),
      api.listMarkers(targetRoomId)
    ]);
    setPlans(planList.map((p) => ({ id: p.id, title: p.title, creatorMemberId: p.creatorMemberId })));
    setStarredIds(new Set(myVotes));
    setVoteResults(result.plans);
    setMemberCount(result.memberCount);
    setMarkers(markerList);
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
    socket.on("marker.created", onVoteUpdated);
    socket.on("marker.updated", onVoteUpdated);
    socket.on("marker.deleted", onVoteUpdated);

    return () => {
      socket.off("vote.updated", onVoteUpdated);
      socket.off("plan.created", onPlanCreated);
      socket.off("marker.created", onVoteUpdated);
      socket.off("marker.updated", onVoteUpdated);
      socket.off("marker.deleted", onVoteUpdated);
      leaveRoomRealtime(roomCode, memberId);
    };
  }, [memberId, roomCode, roomId, refreshPlansAndVotes]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

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
      if (roomId) {
        const result = await api.getVoteResult(roomId);
        setVoteResults(result.plans);
        setMemberCount(result.memberCount);
      }
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : "操作失败", type: "error" });
    }
  }

  async function openPreviewModal(planId: string) {
    try {
      setModalLoading(true);
      setModalPlanId(planId);
      const plan = plans.find((p) => p.id === planId);
      setModalPlanTitle(plan?.title ?? "");
      const items = await api.listPlanItems(planId);
      const planMarkerIds = new Set(items.map((item) => item.markerId));
      const filtered = markers.filter((m) => planMarkerIds.has(m.id));
      setModalMarkers(filtered);
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : "加载预览失败", type: "error" });
    } finally {
      setModalLoading(false);
    }
  }

  function closeModal() {
    setModalPlanId("");
    setModalPlanTitle("");
    setModalMarkers([]);
  }

  async function saveToLocal(planId: string) {
    if (!roomCode) return;
    try {
      const plan = plans.find((p) => p.id === planId);
      const items = await api.listPlanItems(planId);
      const existingMarkerIds = new Set(markers.map((m) => m.id));
      const matched = items
        .filter((item) => existingMarkerIds.has(item.markerId))
        .map((item) => ({ markerId: item.markerId, dayIndex: item.dayIndex, orderIndex: item.orderIndex }));

      if (!matched.length) {
        setToast({ message: "该方案没有可用的地点，无法保存", type: "error" });
        return;
      }

      const drafts = loadDrafts(roomCode);
      const draft: DraftSnapshot = {
        id: crypto.randomUUID(),
        roomCode,
        title: `${plan?.title ?? "共享方案"} 副本`,
        sourcePlanId: planId,
        dayCount: 3,
        markerIds: [...new Set(matched.map((item) => item.markerId))],
        planItems: matched,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      saveDrafts(roomCode, [draft, ...drafts]);
      const skipped = items.length - matched.length;
      setToast({
        message: `"${draft.title}" 已保存到本地${skipped > 0 ? `（${skipped} 个地点已失效已跳过）` : ""}`,
        type: "success"
      });
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : "保存失败", type: "error" });
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

      <motion.header className="wb-header" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div>
          <p className="room-code">
            房间码
            <span className="room-code-value">{roomCode}</span>
            <button
              className="copy-btn"
              onClick={() => {
                navigator.clipboard.writeText(roomCode ?? "").catch(() => {});
              }}
              title="一键复制"
            >
              复制
            </button>
          </p>
          <h1>方案投票与结果</h1>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link className="btn" to={`/rooms/${roomCode}/workbench?memberId=${memberId}`}>返回编排台</Link>
          <Link className="btn" to="/">返回首页</Link>
        </div>
      </motion.header>

      {loading ? <p className="page-note wb-message">加载中...</p> : null}
      {error ? <p className="error-text wb-message">{error}</p> : null}

      {toast && (
        <div className={`toast toast-${toast.type}`}>{toast.message}</div>
      )}

      <motion.div className="vote-layout" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.05 }}>
        <main className="vote-main">
          <h2>候选方案</h2>
          {plans.length === 0 ? (
            <p className="page-note">暂时没有候选方案，请先在编排台推送。</p>
          ) : (
            <div className="vote-plan-list">
              {plans.map((plan) => {
                const starred = starredIds.has(plan.id);
                return (
                  <article key={plan.id} className={`vote-plan-card${starred ? " starred" : ""}`}>
                    <div className="vote-plan-info">
                      <strong>{plan.title}</strong>
                    </div>
                    <div className="vote-plan-actions">
                      <button
                        className="btn btn-sm"
                        onClick={() => openPreviewModal(plan.id)}
                      >
                        预览
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() => saveToLocal(plan.id)}
                      >
                        保存到本地
                      </button>
                      <button
                        className={`star-btn${starred ? " active" : ""}`}
                        onClick={() => toggleStar(plan.id)}
                        title={starred ? "取消点赞" : "点赞"}
                      >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill={starred ? "#f59e0b" : "none"} stroke={starred ? "#f59e0b" : "#94a3b8"} strokeWidth="2">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </main>

        <aside className="vote-leaderboard">
          <h2>投票看板</h2>
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
      </motion.div>

      {modalPlanId ? (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modalPlanTitle}</h3>
              <button className="btn btn-sm" onClick={closeModal}>关闭</button>
            </div>
            <div className="modal-map">
              {modalLoading ? (
                <p className="page-note" style={{ padding: 40, textAlign: "center" }}>加载中...</p>
              ) : (
                <MapCanvas
                  markers={modalMarkers}
                  draftMarker={null}
                  allowCreateMarker={false}
                  onMapReady={(map) => { mapInstanceRef.current = map; }}
                  onMapClick={() => {}}
                  onMarkerClick={() => {}}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
