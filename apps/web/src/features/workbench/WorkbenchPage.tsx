import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../services/api";
import type { MarkerRow } from "../../services/api";
import { joinRoomRealtime, leaveRoomRealtime, socket } from "../../services/socket";
import { MapCanvas, searchPoi } from "../map/MapCanvas";
import type { PoiSelect } from "../map/MapCanvas";
import {
  type DraftSnapshot,
  type PlanItemDraft,
  createDraft,
  loadDrafts,
  saveDrafts
} from "../snapshot/snapshotStore";

type DraftForm = {
  placeName: string;
  lng: number;
  lat: number;
  address?: string;
  poiId?: string;
  budget?: number;
  note?: string;
};

const DAYS = ["第1天", "第2天", "第3天", "第4天", "第5天", "第6天", "第7天"];

export function WorkbenchPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const [search] = useSearchParams();
  const nav = useNavigate();

  const queryMemberId = search.get("memberId") ?? "";
  const storageKey = useMemo(() => (roomCode ? `tp_member_${roomCode}` : ""), [roomCode]);
  const [memberId, setMemberId] = useState("");

  useEffect(() => {
    if (!roomCode || !storageKey) return;
    if (queryMemberId) {
      localStorage.setItem(storageKey, queryMemberId);
      setMemberId(queryMemberId);
      return;
    }
    setMemberId(localStorage.getItem(storageKey) ?? "");
  }, [queryMemberId, roomCode, storageKey]);

  const [roomId, setRoomId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [markers, setMarkers] = useState<MarkerRow[]>([]);
  const [selectedMarkerId, setSelectedMarkerId] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");

  const mapInstanceRef = useRef<unknown>(null);
  const [draftForm, setDraftForm] = useState<DraftForm | null>(null);
  const [saving, setSaving] = useState(false);

  const [drafts, setDrafts] = useState<DraftSnapshot[]>([]);
  const [activeDraftId, setActiveDraftId] = useState("");
  const [sharedPlans, setSharedPlans] = useState<Array<{ id: string; title: string; creatorMemberId: string }>>([]);
  const [leftTab, setLeftTab] = useState<"markers" | "snapshots">("markers");

  const canSave = useMemo(
    () => Boolean(roomId && memberId && draftForm?.placeName?.trim()),
    [roomId, memberId, draftForm?.placeName]
  );

  const activeDraft = useMemo(() => drafts.find((d) => d.id === activeDraftId) ?? null, [drafts, activeDraftId]);
  const draftItemsByDay = useMemo(() => {
    const map = new Map<number, PlanItemDraft[]>();
    if (activeDraft) {
      activeDraft.planItems.forEach((item) => {
        const list = map.get(item.dayIndex) ?? [];
        list.push(item);
        map.set(item.dayIndex, list);
      });
    }
    return map;
  }, [activeDraft]);

  const refreshMarkers = useCallback(async (rid: string) => {
    const rows = await api.listMarkers(rid);
    setMarkers(rows);
  }, []);

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    (async () => {
      try {
        if (!roomCode) return;
        const room = await api.getRoom(roomCode);
        if (disposed) return;
        setRoomId(room.id);
        await refreshMarkers(room.id);
        setDrafts(loadDrafts(roomCode));
        try {
          const plans = await api.listPlans(room.id);
          setSharedPlans(plans);
        } catch { /* ignore */ }
      } catch (e) {
        setError(e instanceof Error ? e.message : "初始化失败");
      } finally {
        if (!disposed) setLoading(false);
      }
    })();
    return () => { disposed = true; };
  }, [roomCode]);

  useEffect(() => {
    if (!roomCode || !memberId) return;
    joinRoomRealtime(roomCode, memberId);
    const handler = async () => {
      const rid = roomId || (await api.getRoom(roomCode)).id;
      await refreshMarkers(rid);
    };
    socket.on("marker.created", handler);
    socket.on("marker.updated", handler);
    socket.on("marker.deleted", handler);
    socket.on("plan.created", async () => {
      if (roomId) {
        const plans = await api.listPlans(roomId);
        setSharedPlans(plans);
      }
    });
    return () => {
      socket.off("marker.created", handler);
      socket.off("marker.updated", handler);
      socket.off("marker.deleted", handler);
      socket.off("plan.created", () => {});
      leaveRoomRealtime(roomCode, memberId);
    };
  }, [roomCode, memberId, roomId]);

  async function saveMarker() {
    if (!draftForm || !canSave) return;
    try {
      if (!memberId) { setError("缺少成员标识"); return; }
      setSaving(true);
      await api.createMarker(roomId, {
        memberId,
        placeName: draftForm.placeName.trim(),
        lng: draftForm.lng,
        lat: draftForm.lat,
        address: draftForm.address,
        poiId: draftForm.poiId,
        budget: draftForm.budget,
        note: draftForm.note
      });
      await refreshMarkers(roomId);
      setDraftForm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  function handleNewScheme() {
    if (!roomCode) return;
    const draft = createDraft(roomCode);
    const next = [...drafts, draft];
    setDrafts(next);
    saveDrafts(roomCode, next);
    setActiveDraftId(draft.id);
    setLeftTab("snapshots");
  }

  function handleDeleteDraft(id: string) {
    if (!roomCode) return;
    const next = drafts.filter((d) => d.id !== id);
    setDrafts(next);
    saveDrafts(roomCode, next);
    if (activeDraftId === id) setActiveDraftId("");
  }

  function handleDropOnDay(markerId: string, dayIndex: number) {
    if (!activeDraft || !roomCode) return;
    const existing = activeDraft.planItems.filter((i) => i.markerId === markerId);
    if (existing.length > 0) return;
    const orderIndex = activeDraft.planItems.filter((i) => i.dayIndex === dayIndex).length + 1;
    const updated: DraftSnapshot = {
      ...activeDraft,
      planItems: [...activeDraft.planItems, { markerId, dayIndex, orderIndex }],
      updatedAt: new Date().toISOString()
    };
    const next = drafts.map((d) => (d.id === activeDraft.id ? updated : d));
    setDrafts(next);
    saveDrafts(roomCode, next);
  }

  function handleRemovePlanItem(markerId: string, dayIndex: number) {
    if (!activeDraft || !roomCode) return;
    const updated: DraftSnapshot = {
      ...activeDraft,
      planItems: activeDraft.planItems.filter((i) => !(i.markerId === markerId && i.dayIndex === dayIndex)),
      updatedAt: new Date().toISOString()
    };
    const next = drafts.map((d) => (d.id === activeDraft.id ? updated : d));
    setDrafts(next);
    saveDrafts(roomCode, next);
  }

  async function handlePushToRoom() {
    if (!activeDraft || !roomId || !memberId) return;
    try {
      const plan = await api.createPlan(roomId, {
        creatorMemberId: memberId,
        title: activeDraft.title
      });
      for (const item of activeDraft.planItems) {
        await api.createPlanItem(plan.id, {
          markerId: item.markerId,
          dayIndex: item.dayIndex,
          startTime: `${new Date().toISOString().slice(0, 10)}T09:00:00Z`,
          endTime: `${new Date().toISOString().slice(0, 10)}T10:00:00Z`,
          orderIndex: item.orderIndex
        });
      }
      const plans = await api.listPlans(roomId);
      setSharedPlans(plans);
    } catch (e) {
      setError(e instanceof Error ? e.message : "推送失败");
    }
  }

  async function handleSaveSharedToLocal(planId: string) {
    if (!roomCode) return;
    try {
      const items = await api.listPlanItems(planId);
      const planItems: PlanItemDraft[] = items.map((i) => ({
        markerId: i.markerId,
        dayIndex: i.dayIndex,
        orderIndex: i.orderIndex
      }));
      const draft: DraftSnapshot = {
        id: crypto.randomUUID(),
        roomCode,
        title: `保存的方案 ${new Date().toLocaleString("zh-CN")}`,
        sourcePlanId: planId,
        planItems,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      const next = [...drafts, draft];
      setDrafts(next);
      saveDrafts(roomCode, next);
      setActiveDraftId(draft.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    }
  }

  function getMarkerName(id: string) {
    return markers.find((m) => m.id === id)?.placeName ?? "(未知)";
  }

  return (
    <div className="app-bg workbench-shell">
      <div className="orb orb-a" /><div className="orb orb-b" />

      <header className="wb-header">
        <div>
          <p className="room-code">房间码：{roomCode}</p>
          <h1>协同规划工作台</h1>
        </div>
        <Link className="btn" to="/">返回首页</Link>
      </header>

      {loading ? <p className="page-note">加载中...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      <div className="wb-layout">
        {/* Left Panel */}
        <aside className="wb-left">
          <div className="wb-tabs">
            <button className={`wb-tab ${leftTab === "markers" ? "active" : ""}`} onClick={() => setLeftTab("markers")}>标点列表</button>
            <button className={`wb-tab ${leftTab === "snapshots" ? "active" : ""}`} onClick={() => setLeftTab("snapshots")}>方案管理</button>
          </div>

          {leftTab === "markers" ? (
            <div className="wb-panel">
              <div className="wb-search-row">
                <input value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} placeholder="搜索地点，如：东京塔" />
                <button className="btn btn-primary btn-sm" onClick={() => searchPoi(mapInstanceRef.current, searchKeyword, (poi: PoiSelect) => {
                  setDraftForm({ placeName: poi.placeName, lng: poi.lng, lat: poi.lat, address: poi.address, poiId: poi.poiId });
                })}>搜索</button>
              </div>

              {draftForm ? (
                <div className="draft-box">
                  <h4>标点编辑</h4>
                  <div className="draft-grid">
                    <label><span>地点名称</span><input value={draftForm.placeName} onChange={(e) => setDraftForm({ ...draftForm, placeName: e.target.value })} /></label>
                    <label><span>预算（可选）</span><input type="number" value={draftForm.budget ?? ""} onChange={(e) => setDraftForm({ ...draftForm, budget: e.target.value ? Number(e.target.value) : undefined })} /></label>
                    <label><span>备注（可选）</span><input value={draftForm.note ?? ""} onChange={(e) => setDraftForm({ ...draftForm, note: e.target.value })} /></label>
                    <p className="page-note">坐标：{draftForm.lng.toFixed(5)}, {draftForm.lat.toFixed(5)}</p>
                    <div className="row-btns">
                      <button className="btn btn-primary btn-sm" disabled={!canSave || saving} onClick={saveMarker}>{saving ? "保存中..." : "保存标点"}</button>
                      <button className="btn btn-sm" onClick={() => setDraftForm(null)}>取消</button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="page-note">点击地图添加标点，或搜索地点</p>
              )}

              <h4>已标点列表（{markers.length}）</h4>
              {markers.length === 0 ? (
                <p className="page-note">还没有标点</p>
              ) : (
                <ul className="marker-list-inner">
                  {markers.map((row) => (
                    <li key={row.id}>
                      <button
                        className={`marker-item ${selectedMarkerId === row.id ? "active" : ""}`}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData("markerId", row.id); }}
                        onClick={() => {
                          setSelectedMarkerId(row.id);
                          const m = mapInstanceRef.current as { setCenter: (p: [number, number]) => void; setZoom: (z: number) => void } | null;
                          if (m) { m.setCenter([row.lng, row.lat]); m.setZoom(14); }
                          document.querySelector(`[data-mid="${row.id}"]`)?.scrollIntoView?.({ behavior: "smooth", block: "center" });
                        }}
                      >
                        <strong>{row.placeName}</strong>
                        <span>预算：{row.budget ?? "-"}</span>
                        <small>{row.lng.toFixed(4)}, {row.lat.toFixed(4)}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="wb-panel">
              <button className="btn btn-primary" onClick={handleNewScheme}>新建方案快照</button>

              <h4>我的草稿（{drafts.length}）</h4>
              {drafts.length === 0 ? (
                <p className="page-note">暂无草稿。点击"新建方案快照"创建。</p>
              ) : (
                <ul className="marker-list-inner">
                  {drafts.map((d) => (
                    <li key={d.id}>
                      <button className={`marker-item ${activeDraftId === d.id ? "active" : ""}`} onClick={() => setActiveDraftId(d.id)}>
                        <strong>{d.title}</strong>
                        <span>{d.planItems.length} 个行程项</span>
                        <small>创建于 {new Date(d.createdAt).toLocaleDateString("zh-CN")}</small>
                        <div className="row-btns">
                          <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); handlePushToRoom(); }}>推送给房间</button>
                          <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); handleDeleteDraft(d.id); }}>删除</button>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <h4>共享方案（{sharedPlans.length}）</h4>
              {sharedPlans.length === 0 ? (
                <p className="page-note">还没有共享方案</p>
              ) : (
                <ul className="marker-list-inner">
                  {sharedPlans.map((p) => (
                    <li key={p.id}>
                      <button className="marker-item" onClick={() => handleSaveSharedToLocal(p.id)}>
                        <strong>{p.title}</strong>
                        <span>点击保存到本地编辑</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </aside>

        {/* Center Map */}
        <main className="wb-center">
          <MapCanvas
            markers={markers}
            onMapReady={(map) => { mapInstanceRef.current = map; }}
            onMapClick={(lng, lat, address) => setDraftForm({ placeName: address, address, lng, lat })}
            onMarkerClick={(row) => setSelectedMarkerId(row.id)}
          />
        </main>

        {/* Right Panel */}
        <aside className="wb-right">
          <h4>日程编排</h4>
          {!activeDraft ? (
            <p className="page-note">选择或新建一个方案后，将左侧标点拖入日程。</p>
          ) : (
            <>
              <p className="page-note">当前方案：{activeDraft.title}（{activeDraft.planItems.length} 项）</p>
              <div className="schedule-grid">
                {DAYS.map((label, idx) => {
                  const dayIndex = idx + 1;
                  const items = draftItemsByDay.get(dayIndex) ?? [];
                  return (
                    <div
                      key={label}
                      className="day-column"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const markerId = e.dataTransfer.getData("markerId");
                        if (markerId) handleDropOnDay(markerId, dayIndex);
                      }}
                    >
                      <p className="day-label">{label}</p>
                      {items.length === 0 ? (
                        <p className="day-hint">拖入标点</p>
                      ) : (
                        items.map((item, i) => (
                          <div key={`${item.markerId}-${i}`} className="day-item">
                            <span>{getMarkerName(item.markerId)}</span>
                            <button className="item-remove" onClick={() => handleRemovePlanItem(item.markerId, dayIndex)}>x</button>
                          </div>
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="row-btns">
                <button className="btn btn-primary" onClick={handlePushToRoom}>推送给房间</button>
                <button className="btn" onClick={() => handleDeleteDraft(activeDraft.id)}>删除草稿</button>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
