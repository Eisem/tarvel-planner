import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../services/api";
import type { MarkerRow } from "../../services/api";
import { joinRoomRealtime, leaveRoomRealtime, socket } from "../../services/socket";
import { MapCanvas, searchPoi } from "../map/MapCanvas";
import type { PoiSelect } from "../map/MapCanvas";
import { type DraftSnapshot, type PlanItemDraft, type SnapshotMarker, createDraft, loadDrafts, saveDrafts } from "../snapshot/snapshotStore";

type DraftForm = {
  placeName: string;
  lng: number;
  lat: number;
  address?: string;
  poiId?: string;
  budget?: number;
  note?: string;
};

const MIN_DAYS = 1;
const MAX_DAYS = 14;

export function WorkbenchPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const [search] = useSearchParams();

  const queryMemberId = search.get("memberId") ?? "";
  const queryNickname = search.get("nickname") ?? "";
  const storageKey = useMemo(() => (roomCode ? `tp_member_${roomCode}` : ""), [roomCode]);
  const nicknameStorageKey = useMemo(() => (roomCode ? `tp_nickname_${roomCode}` : ""), [roomCode]);
  const [memberId, setMemberId] = useState("");
  const [memberNickname, setMemberNickname] = useState("");
  const [memberColor, setMemberColor] = useState<string>("#ef4444");
  const [roomId, setRoomId] = useState("");
  const [roomName, setRoomName] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  const [markers, setMarkers] = useState<MarkerRow[]>([]);
  const [selectedMarkerId, setSelectedMarkerId] = useState("");
  const [selectedForSnapshot, setSelectedForSnapshot] = useState<string[]>([]);
  const [draftForm, setDraftForm] = useState<DraftForm | null>(null);
  const [drafts, setDrafts] = useState<DraftSnapshot[]>([]);
  const [activeDraftId, setActiveDraftId] = useState("");
  const [sharedPlans, setSharedPlans] = useState<Array<{ id: string; title: string; creatorMemberId: string }>>([]);
  const [previewShared, setPreviewShared] = useState<{ planId: string; title: string; items: PlanItemDraft[] } | null>(null);
  const [leftTab, setLeftTab] = useState<"markers" | "snapshots">("markers");
  const [placeListExpanded, setPlaceListExpanded] = useState(true);
  const [snapshotMode, setSnapshotMode] = useState(false);
  const [dropTarget, setDropTarget] = useState<{ dayIndex: number; beforeMarkerId?: string } | null>(null);

  const mapInstanceRef = useRef<unknown>(null);
  const activeDraft = useMemo(() => drafts.find((d) => d.id === activeDraftId) ?? null, [drafts, activeDraftId]);
  const selectedMarker = useMemo(() => markers.find((marker) => marker.id === selectedMarkerId) ?? null, [markers, selectedMarkerId]);
  const canEditSelectedMarker = useMemo(
    () => !selectedMarker || selectedMarker.creatorNickname === memberNickname,
    [selectedMarker, memberNickname]
  );
  const activeDraftMarkerIds = useMemo(() => {
    if (!activeDraft) return markers.map((m) => m.id);
    if (activeDraft.markerIds && activeDraft.markerIds.length > 0) return activeDraft.markerIds;
    if (activeDraft.planItems.length > 0) {
      return [...new Set(activeDraft.planItems.map((item) => item.markerId))];
    }
    return markers.map((m) => m.id);
  }, [activeDraft, markers]);
  const activeDraftMarkerList = useMemo<SnapshotMarker[]>(() => {
    if (!activeDraft) return [];
    if (activeDraft.markerSnapshots && activeDraft.markerSnapshots.length > 0) {
      return activeDraft.markerSnapshots;
    }
    return markers
      .filter((marker) => activeDraftMarkerIds.includes(marker.id))
      .map((marker) => ({
        markerId: marker.id,
        placeName: marker.placeName,
        lng: marker.lng,
        lat: marker.lat,
        budget: marker.budget,
        note: marker.note
      }));
  }, [activeDraft, markers, activeDraftMarkerIds]);
  const markersForMap = useMemo(() => {
    if (leftTab !== "snapshots" || !activeDraft) return markers;
    if (activeDraftMarkerList.length > 0) {
      return activeDraftMarkerList.map((item, index) => ({
        id: item.markerId || `snapshot-${index}`,
        memberId,
        creatorNickname: memberNickname,
        color: memberColor,
        placeName: item.placeName,
        lng: item.lng,
        lat: item.lat,
        budget: item.budget,
        note: item.note
      }));
    }
    const selected = new Set(activeDraftMarkerIds);
    return markers.filter((marker) => selected.has(marker.id));
  }, [activeDraft, activeDraftMarkerIds, activeDraftMarkerList, leftTab, markers, memberColor, memberId, memberNickname]);
  const activeDayCount = activeDraft?.dayCount ?? 3;
  const dayIndexes = useMemo(() => Array.from({ length: activeDayCount }, (_, idx) => idx + 1), [activeDayCount]);

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

  const DAY_COLORS = ["#f97316", "#22c55e", "#3b82f6", "#eab308", "#a855f7", "#ef4444", "#ec4899"];

  const routePaths = useMemo(() => {
    if (leftTab !== "snapshots") return undefined;
    if (!activeDraft || activeDraft.planItems.length === 0) return undefined;
    const routes: Array<{ dayIndex: number; path: [number, number][]; stops: Array<{ lng: number; lat: number; label: string; isFirst: boolean; isLast: boolean }>; color: string }> = [];
    draftItemsByDay.forEach((items, dayIndex) => {
      if (items.length < 2) return;
      const path: [number, number][] = [];
      const stops: Array<{ lng: number; lat: number; label: string; isFirst: boolean; isLast: boolean }> = [];
      items.forEach((item, idx) => {
        const marker = markers.find((m) => m.id === item.markerId);
        if (marker) {
          path.push([marker.lng, marker.lat]);
          stops.push({
            lng: marker.lng,
            lat: marker.lat,
            label: String(item.orderIndex),
            isFirst: idx === 0,
            isLast: idx === items.length - 1
          });
        }
      });
      if (path.length >= 2) {
        routes.push({ dayIndex, path, stops, color: DAY_COLORS[(dayIndex - 1) % DAY_COLORS.length] });
      }
    });
    return routes.length > 0 ? routes : undefined;
  }, [activeDraft, draftItemsByDay, markers, leftTab]);

  useEffect(() => {
    if (!roomCode || !storageKey) return;
    if (queryMemberId) {
      localStorage.setItem(storageKey, queryMemberId);
      setMemberId(queryMemberId);
    } else {
      setMemberId(localStorage.getItem(storageKey) ?? "");
    }
    if (queryNickname) {
      localStorage.setItem(nicknameStorageKey, queryNickname);
      setMemberNickname(queryNickname);
    } else {
      setMemberNickname(localStorage.getItem(nicknameStorageKey) ?? "");
    }
  }, [queryMemberId, queryNickname, roomCode, storageKey, nicknameStorageKey]);

  const refreshMarkers = useCallback(async (targetRoomId: string) => {
    const rows = await api.listMarkers(targetRoomId);
    setMarkers(rows);
  }, []);

  const refreshSharedPlans = useCallback(async (targetRoomId: string) => {
    const plans = await api.listPlans(targetRoomId);
    setSharedPlans(plans.map((plan) => ({ id: plan.id, title: plan.title, creatorMemberId: plan.creatorMemberId })));
  }, []);

  useEffect(() => {
    if (leftTab === "markers") {
      setSnapshotMode(false);
      setSelectedForSnapshot([]);
      setDraftForm(null);
      setError("");
      setActiveDraftId("");
      if (roomId) {
        refreshMarkers(roomId).catch(() => undefined);
      }
    }
  }, [leftTab, roomId, refreshMarkers]);

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    (async () => {
      try {
        if (!roomCode) return;
        const room = await api.getRoom(roomCode);
        if (disposed) return;
        setRoomId(room.id);
        setRoomName(room.name ?? "");
        if (memberId) {
          const members = await api.listMembers(roomCode);
          const self = members.find((member) => member.id === memberId);
          if (self?.color) {
            setMemberColor(self.color);
          }
        }
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
  }, [roomCode, memberId, refreshMarkers, refreshSharedPlans]);

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
    if (leftTab !== "snapshots") return;
    if (drafts.length === 0) {
      setActiveDraftId("");
      return;
    }
    const exists = drafts.some((draft) => draft.id === activeDraftId);
    if (!exists) {
      setActiveDraftId(drafts[0].id);
    }
  }, [leftTab, drafts, activeDraftId]);

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
    const picked = markers.filter((marker) => selectedForSnapshot.includes(marker.id));
    if (picked.length === 0) {
      setError("请选择至少一个地点加入快照");
      return;
    }
    const draft = createDraft(roomCode, `方案 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`);
    draft.markerIds = picked.slice(0, 60).map((marker) => marker.id);
    draft.markerSnapshots = picked.slice(0, 60).map((marker) => ({
      markerId: marker.id,
      placeName: marker.placeName,
      lng: marker.lng,
      lat: marker.lat,
      budget: marker.budget,
      note: marker.note
    }));
    draft.planItems = [];
    const next = [draft, ...drafts];
    persistDrafts(next);
    setActiveDraftId(draft.id);
    setLeftTab("snapshots");
    setSelectedForSnapshot([]);
    setSnapshotMode(false);
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

  function toggleMarkerForSnapshot(markerId: string) {
    setSelectedForSnapshot((prev) => {
      if (prev.includes(markerId)) {
        return prev.filter((id) => id !== markerId);
      }
      return [...prev, markerId];
    });
  }

  function selectAllForSnapshot() {
    setSelectedForSnapshot(markers.map((marker) => marker.id));
  }

  function invertSelectedForSnapshot() {
    const selectedSet = new Set(selectedForSnapshot);
    setSelectedForSnapshot(markers.filter((marker) => !selectedSet.has(marker.id)).map((marker) => marker.id));
  }

  function updateDayCount(nextDayCount: number) {
    if (!activeDraft) return;
    const bounded = Math.max(MIN_DAYS, Math.min(MAX_DAYS, nextDayCount));
    updateActiveDraft((draft) => {
      const remapped = draft.planItems.map((item) => ({
        ...item,
        dayIndex: Math.min(item.dayIndex, bounded)
      }));
      const grouped = new Map<number, PlanItemDraft[]>();
      remapped.forEach((item) => {
        const list = grouped.get(item.dayIndex) ?? [];
        list.push(item);
        grouped.set(item.dayIndex, list);
      });
      const normalized: PlanItemDraft[] = [];
      grouped.forEach((list, day) => {
        list
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .forEach((item, idx) => normalized.push({ ...item, dayIndex: day, orderIndex: idx + 1 }));
      });
      return { ...draft, dayCount: bounded, planItems: normalized };
    });
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

  function handleDropBefore(markerId: string, dayIndex: number, beforeMarkerId: string) {
    if (!activeDraft) return;

    updateActiveDraft((draft) => {
      const without = draft.planItems.filter((item) => item.markerId !== markerId);
      const dayItems = without.filter((item) => item.dayIndex === dayIndex).sort((a, b) => a.orderIndex - b.orderIndex);
      const targetIndex = dayItems.findIndex((item) => item.markerId === beforeMarkerId);
      const insertAt = targetIndex < 0 ? dayItems.length : targetIndex;
      dayItems.splice(insertAt, 0, { markerId, dayIndex, orderIndex: insertAt + 1 });
      const normalized = dayItems.map((item, idx) => ({ ...item, orderIndex: idx + 1 }));
      const others = without.filter((item) => item.dayIndex !== dayIndex);
      return { ...draft, planItems: [...others, ...normalized] };
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
    if (!canEditSelectedMarker) {
      setError("只能编辑自己创建的标点");
      return;
    }
    try {
      setSaving(true);
      setError("");
      if (selectedMarkerId && markers.some((m) => m.id === selectedMarkerId && m.creatorNickname === memberNickname)) {
        await api.updateMarker(selectedMarkerId, {
          memberId,
          placeName: draftForm.placeName.trim(),
          lng: draftForm.lng,
          lat: draftForm.lat,
          address: draftForm.address,
          poiId: draftForm.poiId,
          budget: draftForm.budget,
          note: draftForm.note
        });
      } else {
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
      }
      await refreshMarkers(roomId);
      setDraftForm(null);
      setSelectedMarkerId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存标点失败");
    } finally {
      setSaving(false);
    }
  }

  async function deleteMarker(markerId: string) {
    if (!memberNickname || !roomId) return;
    try {
      setError("");
      await api.deleteMarker(markerId, { nickname: memberNickname });
      await refreshMarkers(roomId);
      if (selectedMarkerId === markerId) {
        setSelectedMarkerId("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除标点失败");
    }
  }

  async function handleSearch() {
    if (snapshotMode || leftTab !== "markers") {
      setError("方案管理中不可新增标点，请先切回地点池");
      return;
    }
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

      const markerIdMap = new Map<string, string>();
      const markerById = new Map(markers.map((marker) => [marker.id, marker]));
      const snapshotById = new Map((activeDraft.markerSnapshots ?? []).map((snapshot) => [snapshot.markerId, snapshot]));

      for (const item of activeDraft.planItems) {
        if (markerIdMap.has(item.markerId)) continue;
        const live = markerById.get(item.markerId);
        if (live) {
          markerIdMap.set(item.markerId, live.id);
          continue;
        }
        const snapshot = snapshotById.get(item.markerId);
        if (!snapshot) continue;
        const recreated = await api.createMarker(roomId, {
          memberId,
          placeName: snapshot.placeName,
          lng: snapshot.lng,
          lat: snapshot.lat,
          address: snapshot.address,
          poiId: snapshot.poiId,
          budget: snapshot.budget,
          note: snapshot.note
        });
        markerIdMap.set(item.markerId, (recreated as { id: string }).id);
      }

      for (const item of activeDraft.planItems) {
        const startHour = 8 + (item.orderIndex % 9);
        const usableMarkerId = markerIdMap.get(item.markerId) ?? item.markerId;
        await api.createPlanItem(created.id, {
          markerId: usableMarkerId,
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
        dayCount: 3,
        markerIds: [...new Set(normalized.map((item) => item.markerId))],
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

  async function previewSharedPlan(planId: string) {
    try {
      const source = sharedPlans.find((plan) => plan.id === planId);
      const items = await api.listPlanItems(planId);
      const normalized = items.map((item) => ({ markerId: item.markerId, dayIndex: item.dayIndex, orderIndex: item.orderIndex }));
      setPreviewShared({ planId, title: source?.title ?? "共享方案", items: normalized });
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载预览失败");
    }
  }

  function getMarkerName(markerId: string) {
    const fromSnapshot = activeDraft?.markerSnapshots?.find((marker) => marker.markerId === markerId)?.placeName;
    if (fromSnapshot) return fromSnapshot;
    return markers.find((marker) => marker.id === markerId)?.placeName ?? "(已失效地点)";
  }

  const previewItemsByDay = useMemo(() => {
    const grouped = new Map<number, PlanItemDraft[]>();
    if (!previewShared) return grouped;
    previewShared.items.forEach((item) => {
      const list = grouped.get(item.dayIndex) ?? [];
      list.push(item);
      grouped.set(item.dayIndex, list.sort((a, b) => a.orderIndex - b.orderIndex));
    });
    return grouped;
  }, [previewShared]);

  return (
    <div className="app-bg workbench-shell">
      <div className="orb orb-a" />
      <div className="orb orb-b" />

      <header className="wb-header">
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
          <h1>{roomName || "未命名房间"}</h1>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link className="btn" to={`/rooms/${roomCode}/vote?memberId=${memberId}&nickname=${encodeURIComponent(memberNickname)}`}>投票</Link>
          <Link className="btn" to="/">返回首页</Link>
        </div>
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
                <input value={searchKeyword} onChange={(event) => setSearchKeyword(event.target.value)} placeholder="搜索地点，如：紫禁城" />
                <button className="btn btn-primary btn-sm" disabled={searching} onClick={handleSearch}>{searching ? "搜索中" : "搜索"}</button>
              </div>

              <div className="snapshot-entry">
                {!snapshotMode ? (
                  <button className="btn btn-primary snapshot-mode-btn" onClick={() => { setSnapshotMode(true); setSelectedForSnapshot([]); setDraftForm(null); setError(""); setLeftTab("snapshots"); if (drafts.length > 0) setActiveDraftId(drafts[0].id); }}>
                    开始规划
                  </button>
                ) : (
                  <div className="snapshot-mode-panel">
                    <p className="page-note">规划模式已开启：请勾选地点后保存。</p>
                    <div className="row-btns">
                      <button className="btn btn-primary btn-sm" onClick={createSnapshotFromMarkers}>保存为本地方案</button>
                      <button className="btn btn-sm" onClick={selectAllForSnapshot}>全选</button>
                      <button className="btn btn-sm" onClick={invertSelectedForSnapshot}>反选</button>
                      <button className="btn btn-sm" onClick={() => setSelectedForSnapshot([])}>清空勾选</button>
                      <button className="btn btn-sm" onClick={() => { setSnapshotMode(false); setSelectedForSnapshot([]); }}>退出规划模式</button>
                    </div>
                    <p className="page-note">已勾选 {selectedForSnapshot.length} / {markers.length} 个地点</p>
                  </div>
                )}
              </div>

              {!snapshotMode && draftForm ? (
                <div className="draft-box">
                  <h4>标点编辑</h4>
                  <div className="draft-grid">
                    <label><span>地点名称</span><input value={draftForm.placeName} onChange={(event) => setDraftForm({ ...draftForm, placeName: event.target.value })} /></label>
                    <label><span>预算（可选）</span><input type="number" value={draftForm.budget ?? ""} onChange={(event) => setDraftForm({ ...draftForm, budget: event.target.value ? Number(event.target.value) : undefined })} /></label>
                    <label><span>备注（可选）</span><input value={draftForm.note ?? ""} onChange={(event) => setDraftForm({ ...draftForm, note: event.target.value })} /></label>
                    <p className="page-note">坐标：{draftForm.lng.toFixed(5)}, {draftForm.lat.toFixed(5)}</p>
                    {!canEditSelectedMarker ? <p className="page-note">该标点属于其他成员，仅可查看。</p> : null}
                    <div className="row-btns">
                      <button className="btn btn-primary btn-sm" disabled={saving || !draftForm.placeName.trim() || !canEditSelectedMarker} onClick={saveMarker}>{saving ? "保存中" : "保存"}</button>
                      <button className="btn btn-sm" onClick={() => setDraftForm(null)}>取消</button>
                    </div>
                  </div>
                </div>
              ) : null}

              <h4>地点池（{markers.length}）</h4>
              <ul className="marker-list-inner">
                {markers.map((marker) => (
                  <li key={marker.id}>
                    <div className={selectedMarkerId === marker.id ? "marker-item active" : "marker-item"}>
                      {snapshotMode ? (
                        <label className="marker-check">
                          <input
                            type="checkbox"
                            checked={selectedForSnapshot.includes(marker.id)}
                            onChange={() => toggleMarkerForSnapshot(marker.id)}
                          />
                          <span>加入方案</span>
                        </label>
                      ) : null}
                      <button
                        className="marker-focus"
                        draggable
                        onDragStart={(event) => event.dataTransfer.setData("markerId", marker.id)}
                        onClick={() => {
                          setSelectedMarkerId(marker.id);
                          setDraftForm({
                            placeName: marker.placeName,
                            lng: marker.lng,
                            lat: marker.lat,
                            budget: marker.budget,
                            note: marker.note
                          });
                          const map = mapInstanceRef.current as { setCenter: (point: [number, number]) => void; setZoom: (zoom: number) => void } | null;
                          if (map) {
                            map.setCenter([marker.lng, marker.lat]);
                            map.setZoom(14);
                          }
                        }}
                      >
                        <strong>{marker.placeName}</strong>
                        <span>预算：{marker.budget ?? "-"}</span>
                        <span>创建者：{marker.creatorNickname ?? "未知"}</span>
                        <small>{marker.lng.toFixed(4)}, {marker.lat.toFixed(4)}</small>
                      </button>
                      {marker.creatorNickname === memberNickname ? (
                        <button className="btn btn-sm" onClick={() => deleteMarker(marker.id)}>删除</button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="wb-panel">
              {snapshotMode ? (
                <div className="snapshot-mode-panel">
                  <p className="page-note">规划模式已开启：请勾选地点后保存为本地方案。</p>
                  <div className="row-btns">
                    <button className="btn btn-primary btn-sm" onClick={createSnapshotFromMarkers}>保存为本地方案</button>
                    <button className="btn btn-sm" onClick={selectAllForSnapshot}>全选</button>
                    <button className="btn btn-sm" onClick={invertSelectedForSnapshot}>反选</button>
                    <button className="btn btn-sm" onClick={() => setSelectedForSnapshot([])}>清空勾选</button>
                    <button className="btn btn-sm" onClick={() => { setSnapshotMode(false); setSelectedForSnapshot([]); }}>退出规划模式</button>
                  </div>
                  <p className="page-note">已勾选 {selectedForSnapshot.length} / {markers.length} 个地点</p>
                  <ul className="marker-list-inner">
                    {markers.map((marker) => (
                      <li key={`pick-${marker.id}`}>
                        <label className="marker-item marker-check-row">
                          <input
                            type="checkbox"
                            checked={selectedForSnapshot.includes(marker.id)}
                            onChange={() => toggleMarkerForSnapshot(marker.id)}
                          />
                          <span>{marker.placeName}</span>
                          <small>{marker.creatorNickname ?? "未知创建者"}</small>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <h4>本地方案（{drafts.length}）</h4>
              <div className="draft-cards">
                {drafts.map((draft) => (
                  <article key={draft.id} className={activeDraftId === draft.id ? "draft-card active" : "draft-card"}>
                    <button className="draft-open" onClick={() => setActiveDraftId(draft.id)}>
                      <strong>{draft.title}</strong>
                      <small>{draft.planItems.length} 个行程点</small>
                    </button>
                    <button className="draft-delete" onClick={() => deleteDraft(draft.id)}>×</button>
                  </article>
                ))}
              </div>

              <h4>共享方案（只读，可复制）</h4>
              <div className="draft-cards">
                {sharedPlans.map((plan) => (
                  <article key={plan.id} className="draft-card">
                    <strong>{plan.title}</strong>
                    <small>创建者：{plan.creatorMemberId}</small>
                    <div className="row-btns">
                      <button className="btn btn-sm" onClick={() => previewSharedPlan(plan.id)}>预览</button>
                      <button className="btn btn-sm" onClick={() => copySharedToLocal(plan.id)}>复制到本地编辑</button>
                    </div>
                  </article>
                ))}
              </div>

              {previewShared ? (
                <div className="shared-preview">
                  <div className="row-btns">
                    <strong>{previewShared.title} 预览</strong>
                    <button className="btn btn-sm" onClick={() => setPreviewShared(null)}>关闭预览</button>
                  </div>
                  <div className="shared-preview-days">
                    {Array.from(previewItemsByDay.keys()).sort((a, b) => a - b).map((day) => (
                      <section key={day} className="shared-day">
                        <p>第{day}天</p>
                        {(previewItemsByDay.get(day) ?? []).map((item) => (
                          <small key={`${item.markerId}-${item.dayIndex}-${item.orderIndex}`}>{item.orderIndex}. {getMarkerName(item.markerId)}</small>
                        ))}
                      </section>
                    ))}
                  </div>
                </div>
              ) : null}

              {activeDraft ? (
                <div className="snapshot-place-bank">
                  <div className="row-btns">
                    <h4>地点列表（拖到右侧行程）</h4>
                    <button className="btn btn-sm" onClick={() => setPlaceListExpanded((prev) => !prev)}>
                      {placeListExpanded ? "收起" : "展开"}
                    </button>
                  </div>
                  {placeListExpanded ? (
                    <ul className="planner-place-list">
                      {activeDraftMarkerList.map((marker) => (
                        <li key={marker.markerId}>
                          <button
                            className="planner-place-item"
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.setData("markerId", marker.markerId);
                              setDropTarget(null);
                            }}
                          >
                            <span className="drag-chip">DRAG</span>
                            <strong>{marker.placeName}</strong>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </aside>

        <main className="wb-center">
          <MapCanvas
            markers={markersForMap}
            routePaths={routePaths}
            draftMarker={draftForm ? { lng: draftForm.lng, lat: draftForm.lat } : null}
            draftMarkerColor={memberColor}
            allowCreateMarker={leftTab === "markers" && !snapshotMode}
            onMapReady={(map) => {
              mapInstanceRef.current = map;
            }}
            onMapClick={(lng, lat, address) => {
              if (snapshotMode || leftTab !== "markers") {
                setError("方案管理中不可新增标点，请先切回地点池");
                return;
              }
              setDraftForm({ placeName: address || "未命名地点", lng, lat, address });
            }}
            onMarkerClick={(marker) => setSelectedMarkerId(marker.id)}
          />
        </main>

        <aside className="wb-right">
          <h4>行程编排</h4>
          {leftTab !== "snapshots" || !activeDraft ? (
            <p className="page-note">请先进入方案管理并打开一个本地方案，再进行行程编排。</p>
          ) : (
            <>
              <input
                className="draft-title-input"
                value={activeDraft.title}
                onChange={(event) => updateActiveDraft((draft) => ({ ...draft, title: event.target.value }))}
              />
              <div className="row-btns">
                <button className="btn btn-sm" onClick={() => updateDayCount(activeDayCount - 1)}>- 减少天数</button>
                <button className="btn btn-sm" onClick={() => updateDayCount(activeDayCount + 1)}>+ 增加天数</button>
                <p className="page-note">当前 {activeDayCount} 天</p>
              </div>
              <p className="page-note">从左侧本地方案区域拖拽地点到右侧天数列。重复拖拽同地点会自动挪到新日期并保留顺序。</p>

              <div className="schedule-grid full">
                {dayIndexes.map((day) => {
                  const items = draftItemsByDay.get(day) ?? [];
                  return (
                    <div
                      key={day}
                      className={dropTarget?.dayIndex === day && !dropTarget.beforeMarkerId ? "day-column drop-target" : "day-column"}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDropTarget({ dayIndex: day });
                      }}
                      onDragLeave={() => {
                        setDropTarget((prev) => (prev?.dayIndex === day && !prev.beforeMarkerId ? null : prev));
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const markerId = event.dataTransfer.getData("markerId");
                        if (markerId) {
                          handleDropOnDay(markerId, day);
                        }
                        setDropTarget(null);
                      }}
                    >
                      <p className="day-label">第{day}天</p>
                      {items.length === 0 ? <p className="day-hint">拖入地点</p> : null}
                      {items.map((item) => (
                        <div
                          key={`${item.markerId}-${item.dayIndex}`}
                          className="day-item"
                          data-mid={item.markerId}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData("markerId", item.markerId);
                            setDropTarget(null);
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            setDropTarget({ dayIndex: day, beforeMarkerId: item.markerId });
                          }}
                          onDragLeave={() => {
                            setDropTarget((prev) =>
                              prev?.dayIndex === day && prev.beforeMarkerId === item.markerId ? null : prev
                            );
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            const markerId = event.dataTransfer.getData("markerId");
                            if (markerId) {
                              handleDropBefore(markerId, day, item.markerId);
                            }
                            setDropTarget(null);
                          }}
                          style={dropTarget?.dayIndex === day && dropTarget.beforeMarkerId === item.markerId ? { outline: "2px solid #3b82f6" } : undefined}
                        >
                          <span>{getMarkerName(item.markerId)}</span>
                          <button className="item-remove" onClick={() => removePlanItem(item.markerId, day)}>×</button>
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
