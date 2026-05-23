import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../services/api";
import type { MarkerRow } from "../../services/api";
import { joinRoomRealtime, leaveRoomRealtime, socket } from "../../services/socket";
import { MapCanvas, searchPoi } from "../map/MapCanvas";
import type { PoiSelect } from "../map/MapCanvas";
import { type DraftSnapshot, type PlanItemDraft, createDraft, loadDrafts, saveDrafts } from "../snapshot/snapshotStore";

type DraftForm = {
  placeName: string;
  lng: number;
  lat: number;
  address?: string;
  poiId?: string;
  budget?: number;
  note?: string;
};

const DAYS = [1, 2, 3, 4, 5, 6, 7];

export function WorkbenchPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const [search] = useSearchParams();

  const queryMemberId = search.get("memberId") ?? "";
  const storageKey = useMemo(() => (roomCode ? `tp_member_${roomCode}` : ""), [roomCode]);
  const [memberId, setMemberId] = useState("");
  const [roomId, setRoomId] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  const [markers, setMarkers] = useState<MarkerRow[]>([]);
  const [selectedMarkerId, setSelectedMarkerId] = useState("");
  const [draftForm, setDraftForm] = useState<DraftForm | null>(null);
  const [drafts, setDrafts] = useState<DraftSnapshot[]>([]);
  const [activeDraftId, setActiveDraftId] = useState("");
  const [sharedPlans, setSharedPlans] = useState<Array<{ id: string; title: string; creatorMemberId: string }>>([]);
  const [leftTab, setLeftTab] = useState<"markers" | "snapshots">("markers");

  const mapInstanceRef = useRef<unknown>(null);
  const activeDraft = useMemo(() => drafts.find((d) => d.id === activeDraftId) ?? null, [drafts, activeDraftId]);

  const draftItemsByDay = useMemo(() => {
    const grouped = new Map<number, PlanItemDraft[]>();
    if (!activeDraft) return grouped;
    activeDraft.planItems.forEach((item) => {
      const list = grouped.get(item.dayIndex) ?? [];
      list.push(item);
      grouped.set(item.dayIndex, list.sort((a, b) => a.orderIndex - b.orderIndex));
    });
    return grouped;
  }, [activeDraft]);

  useEffect(() => {
    if (!roomCode || !storageKey) return;
    if (queryMemberId) {
      localStorage.setItem(storageKey, queryMemberId);
      setMemberId(queryMemberId);
      return;
    }
    setMemberId(localStorage.getItem(storageKey) ?? "");
  }, [queryMemberId, roomCode, storageKey]);

  const refreshMarkers = useCallback(async (targetRoomId: string) => {
    const rows = await api.listMarkers(targetRoomId);
    setMarkers(rows);
  }, []);

  const refreshSharedPlans = useCallback(async (targetRoomId: string) => {
    const plans = await api.listPlans(targetRoomId);
    setSharedPlans(plans.map((plan) => ({ id: plan.id, title: plan.title, creatorMemberId: plan.creatorMemberId })));
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
        setDrafts(loadDrafts(roomCode));
        await Promise.all([refreshMarkers(room.id), refreshSharedPlans(room.id)]);
      } catch (e) {
        if (!disposed) setError(e instanceof Error ? e.message : "初始化失败");
      } finally {
        if (!disposed) setLoading(false);
      }
    })();

    return () => {
      disposed = true;
    };
  }, [roomCode, refreshMarkers, refreshSharedPlans]);

  useEffect(() => {
    if (!roomCode || !memberId) return;

    joinRoomRealtime(roomCode, memberId);
    const onMarkerChanged = async () => {
      if (!roomId) return;
      await refreshMarkers(roomId);
    };
    const onPlanCreated = async () => {
      if (!roomId) return;
      await refreshSharedPlans(roomId);
    };

    socket.on("marker.created", onMarkerChanged);
    socket.on("marker.updated", onMarkerChanged);
    socket.on("marker.deleted", onMarkerChanged);
    socket.on("plan.created", onPlanCreated);

    return () => {
      socket.off("marker.created", onMarkerChanged);
      socket.off("marker.updated", onMarkerChanged);
      socket.off("marker.deleted", onMarkerChanged);
      socket.off("plan.created", onPlanCreated);
      leaveRoomRealtime(roomCode, memberId);
    };
  }, [memberId, roomCode, roomId, refreshMarkers, refreshSharedPlans]);

  useEffect(() => {
    if (!activeDraftId && drafts.length > 0) {
      setActiveDraftId(drafts[0].id);
    }
  }, [activeDraftId, drafts]);

  function persistDrafts(next: DraftSnapshot[]) {
    if (!roomCode) return;
    setDrafts(next);
    saveDrafts(roomCode, next);
  }

  function createSnapshotFromMarkers() {
    if (!roomCode || markers.length === 0) {
      setError("请先在地图上添加地点后再创建快照");
      return;
    }
    const draft = createDraft(roomCode, `快照 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`);
    draft.planItems = markers.slice(0, 32).map((marker, index) => ({ markerId: marker.id, dayIndex: 1, orderIndex: index + 1 }));
    const next = [draft, ...drafts];
    persistDrafts(next);
    setActiveDraftId(draft.id);
    setLeftTab("snapshots");
    setError("");
  }

  function updateActiveDraft(mutator: (draft: DraftSnapshot) => DraftSnapshot) {
    if (!activeDraft) return;
    const updated = mutator({ ...activeDraft, updatedAt: new Date().toISOString() });
    const next = drafts.map((draft) => (draft.id === updated.id ? updated : draft));
    persistDrafts(next);
  }

  function deleteDraft(id: string) {
    const next = drafts.filter((draft) => draft.id !== id);
    persistDrafts(next);
    if (activeDraftId === id) {
      setActiveDraftId(next[0]?.id ?? "");
    }
  }

  function handleDropOnDay(markerId: string, dayIndex: number) {
    if (!activeDraft) return;

    updateActiveDraft((draft) => {
      const without = draft.planItems.filter((item) => item.markerId !== markerId);
      const dayItems = without.filter((item) => item.dayIndex === dayIndex).sort((a, b) => a.orderIndex - b.orderIndex);
      dayItems.push({ markerId, dayIndex, orderIndex: dayItems.length + 1 });
      const others = without.filter((item) => item.dayIndex !== dayIndex);
      return { ...draft, planItems: [...others, ...dayItems] };
    });
  }

  function removePlanItem(markerId: string, dayIndex: number) {
    updateActiveDraft((draft) => ({
      ...draft,
      planItems: draft.planItems.filter((item) => !(item.markerId === markerId && item.dayIndex === dayIndex))
    }));
  }

  function movePlanItem(markerId: string, dayIndex: number, direction: "up" | "down") {
    updateActiveDraft((draft) => {
      const dayItems = draft.planItems
        .filter((item) => item.dayIndex === dayIndex)
        .sort((a, b) => a.orderIndex - b.orderIndex);
      const index = dayItems.findIndex((item) => item.markerId === markerId);
      if (index < 0) return draft;
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= dayItems.length) return draft;
      [dayItems[index], dayItems[targetIndex]] = [dayItems[targetIndex], dayItems[index]];
      const normalized = dayItems.map((item, idx) => ({ ...item, orderIndex: idx + 1 }));
      const others = draft.planItems.filter((item) => item.dayIndex !== dayIndex);
      return { ...draft, planItems: [...others, ...normalized] };
    });
  }

  async function saveMarker() {
    if (!draftForm || !memberId || !roomId) return;
    try {
      setSaving(true);
      setError("");
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
      setError(e instanceof Error ? e.message : "保存标点失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleSearch() {
    try {
      setSearching(true);
      setError("");
      const result = await searchPoi(mapInstanceRef.current, searchKeyword, (poi: PoiSelect) => {
        setDraftForm({ placeName: poi.placeName, lng: poi.lng, lat: poi.lat, address: poi.address, poiId: poi.poiId });
      });
      if (!result.first) {
        setError("未找到匹配地点，请更换关键词");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "搜索失败");
    } finally {
      setSearching(false);
    }
  }

  async function pushDraftToRoom() {
    if (!activeDraft || !roomId || !memberId) {
      setError("请先选择一个草稿，并确认你已加入房间");
      return;
    }

    try {
      setError("");
      const created = await api.createPlan(roomId, {
        creatorMemberId: memberId,
        title: activeDraft.title
      });

      for (const item of activeDraft.planItems) {
        const startHour = 8 + (item.orderIndex % 9);
        await api.createPlanItem(created.id, {
          markerId: item.markerId,
          dayIndex: item.dayIndex,
          startTime: `2026-07-${String(item.dayIndex).padStart(2, "0")}T${String(startHour).padStart(2, "0")}:00:00Z`,
          endTime: `2026-07-${String(item.dayIndex).padStart(2, "0")}T${String(startHour + 1).padStart(2, "0")}:00:00Z`,
          orderIndex: item.orderIndex
        });
      }

      await refreshSharedPlans(roomId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "推送方案失败");
    }
  }

  async function copySharedToLocal(planId: string) {
    if (!roomCode) return;
    try {
      const plan = sharedPlans.find((row) => row.id === planId);
      const items = await api.listPlanItems(planId);
      const existingMarkerIds = new Set(markers.map((marker) => marker.id));
      const normalized = items
        .filter((item) => existingMarkerIds.has(item.markerId))
        .map((item) => ({ markerId: item.markerId, dayIndex: item.dayIndex, orderIndex: item.orderIndex }));

      if (!normalized.length) {
        setError("该方案引用的地点当前房间不可用，无法复制");
        return;
      }

      const draft: DraftSnapshot = {
        id: crypto.randomUUID(),
        roomCode,
        title: `${plan?.title || "共享方案"} 副本`,
        sourcePlanId: planId,
        planItems: normalized,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      const next = [draft, ...drafts];
      persistDrafts(next);
      setActiveDraftId(draft.id);
      setLeftTab("snapshots");
      if (normalized.length < items.length) {
        setError("已复制可用地点，部分失效地点已自动跳过");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "复制共享方案失败");
    }
  }

  function getMarkerName(markerId: string) {
    return markers.find((marker) => marker.id === markerId)?.placeName ?? "(已失效地点)";
  }

  return (
    <div className="app-bg workbench-shell">
      <div className="orb orb-a" />
      <div className="orb orb-b" />

      <header className="wb-header">
        <div>
          <p className="room-code">房间码：{roomCode}</p>
          <h1>Group Trip Workspace</h1>
        </div>
        <Link className="btn" to="/">返回首页</Link>
      </header>

      {loading ? <p className="page-note wb-message">加载中...</p> : null}
      {error ? <p className="error-text wb-message">{error}</p> : null}

      <div className="wb-layout">
        <aside className="wb-left">
          <div className="wb-tabs">
            <button className={leftTab === "markers" ? "wb-tab active" : "wb-tab"} onClick={() => setLeftTab("markers")}>地点池</button>
            <button className={leftTab === "snapshots" ? "wb-tab active" : "wb-tab"} onClick={() => setLeftTab("snapshots")}>方案管理</button>
          </div>

          {leftTab === "markers" ? (
            <div className="wb-panel">
              <div className="wb-search-row">
                <input value={searchKeyword} onChange={(event) => setSearchKeyword(event.target.value)} placeholder="搜索地点，如：东京塔" />
                <button className="btn btn-primary btn-sm" disabled={searching} onClick={handleSearch}>{searching ? "搜索中" : "搜索"}</button>
              </div>

              {draftForm ? (
                <div className="draft-box">
                  <h4>标点编辑</h4>
                  <div className="draft-grid">
                    <label><span>地点名称</span><input value={draftForm.placeName} onChange={(event) => setDraftForm({ ...draftForm, placeName: event.target.value })} /></label>
                    <label><span>预算（可选）</span><input type="number" value={draftForm.budget ?? ""} onChange={(event) => setDraftForm({ ...draftForm, budget: event.target.value ? Number(event.target.value) : undefined })} /></label>
                    <label><span>备注（可选）</span><input value={draftForm.note ?? ""} onChange={(event) => setDraftForm({ ...draftForm, note: event.target.value })} /></label>
                    <p className="page-note">坐标：{draftForm.lng.toFixed(5)}, {draftForm.lat.toFixed(5)}</p>
                    <div className="row-btns">
                      <button className="btn btn-primary btn-sm" disabled={saving || !draftForm.placeName.trim()} onClick={saveMarker}>{saving ? "保存中" : "保存"}</button>
                      <button className="btn btn-sm" onClick={() => setDraftForm(null)}>取消</button>
                    </div>
                  </div>
                </div>
              ) : null}

              <h4>地点池（{markers.length}）</h4>
              <ul className="marker-list-inner">
                {markers.map((marker) => (
                  <li key={marker.id}>
                    <button
                      className={selectedMarkerId === marker.id ? "marker-item active" : "marker-item"}
                      draggable
                      onDragStart={(event) => event.dataTransfer.setData("markerId", marker.id)}
                      onClick={() => {
                        setSelectedMarkerId(marker.id);
                        const map = mapInstanceRef.current as { setCenter: (point: [number, number]) => void; setZoom: (zoom: number) => void } | null;
                        if (map) {
                          map.setCenter([marker.lng, marker.lat]);
                          map.setZoom(14);
                        }
                      }}
                    >
                      <strong>{marker.placeName}</strong>
                      <span>预算：{marker.budget ?? "-"}</span>
                      <small>{marker.lng.toFixed(4)}, {marker.lat.toFixed(4)}</small>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="wb-panel">
              <button className="btn btn-primary" onClick={createSnapshotFromMarkers}>保存地点池为方案快照</button>

              <h4>本地快照（{drafts.length}）</h4>
              <div className="draft-cards">
                {drafts.map((draft) => (
                  <article key={draft.id} className={activeDraftId === draft.id ? "draft-card active" : "draft-card"}>
                    <button className="draft-open" onClick={() => setActiveDraftId(draft.id)}>
                      <strong>{draft.title}</strong>
                      <small>{draft.planItems.length} 个行程点</small>
                    </button>
                    <div className="row-btns">
                      <button className="btn btn-sm" onClick={() => setActiveDraftId(draft.id)}>打开</button>
                      <button className="btn btn-sm" onClick={() => deleteDraft(draft.id)}>删除</button>
                    </div>
                  </article>
                ))}
              </div>

              <h4>共享方案（只读，可复制）</h4>
              <div className="draft-cards">
                {sharedPlans.map((plan) => (
                  <article key={plan.id} className="draft-card">
                    <strong>{plan.title}</strong>
                    <small>创建者：{plan.creatorMemberId}</small>
                    <button className="btn btn-sm" onClick={() => copySharedToLocal(plan.id)}>复制到本地编辑</button>
                  </article>
                ))}
              </div>
            </div>
          )}
        </aside>

        <main className="wb-center">
          <MapCanvas
            markers={markers}
            onMapReady={(map) => {
              mapInstanceRef.current = map;
            }}
            onMapClick={(lng, lat, address) => setDraftForm({ placeName: address || "未命名地点", lng, lat, address })}
            onMarkerClick={(marker) => setSelectedMarkerId(marker.id)}
          />
        </main>

        <aside className="wb-right">
          <h4>行程编排</h4>
          {!activeDraft ? (
            <p className="page-note">先在左侧创建或打开快照，然后把地点拖入对应日期。</p>
          ) : (
            <>
              <input
                className="draft-title-input"
                value={activeDraft.title}
                onChange={(event) => updateActiveDraft((draft) => ({ ...draft, title: event.target.value }))}
              />
              <p className="page-note">拖拽地点卡片到右侧日期列。冲突处理：同一地点重复拖拽会自动移动到新日期。</p>
              <div className="schedule-grid">
                {DAYS.map((day) => {
                  const items = draftItemsByDay.get(day) ?? [];
                  return (
                    <div
                      key={day}
                      className="day-column"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        const markerId = event.dataTransfer.getData("markerId");
                        if (markerId) {
                          handleDropOnDay(markerId, day);
                        }
                      }}
                    >
                      <p className="day-label">第{day}天</p>
                      {items.length === 0 ? <p className="day-hint">拖入地点</p> : null}
                      {items.map((item) => (
                        <div key={`${item.markerId}-${item.dayIndex}`} className="day-item" data-mid={item.markerId}>
                          <span>{getMarkerName(item.markerId)}</span>
                          <div className="row-btns">
                            <button className="item-remove" onClick={() => movePlanItem(item.markerId, day, "up")}>↑</button>
                            <button className="item-remove" onClick={() => movePlanItem(item.markerId, day, "down")}>↓</button>
                            <button className="item-remove" onClick={() => removePlanItem(item.markerId, day)}>x</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
              <div className="row-btns">
                <button className="btn btn-primary" onClick={pushDraftToRoom}>推送给其他用户查看</button>
                <button className="btn" onClick={() => deleteDraft(activeDraft.id)}>删除本地草稿</button>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
