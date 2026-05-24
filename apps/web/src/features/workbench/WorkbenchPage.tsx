import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
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
const DEFAULT_STOP_MINUTES = 60;
const DEFAULT_START_MINUTES = 9 * 60;
const MIN_DURATION_MINUTES = 15;
const SNAP_MINUTES = 15;
const DAY_MINUTES = 24 * 60;
const TIMELINE_PIXEL_HEIGHT = 520;

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
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
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
  const [dropTarget, setDropTarget] = useState<{ dayIndex: number } | null>(null);
  const [activeTimelineDay, setActiveTimelineDay] = useState(1);
  const [draggingTimeline, setDraggingTimeline] = useState<{
    markerId: string;
    dayIndex: number;
    mode: "move" | "start" | "end";
    startY: number;
    originStart: number;
    originEnd: number;
  } | null>(null);
  const [frozenAnchorCenter, setFrozenAnchorCenter] = useState<number | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});

  const [poiSearchResults, setPoiSearchResults] = useState<PoiSelect[]>([]);
  const [poiSearchTotal, setPoiSearchTotal] = useState(0);
  const [poiPreview, setPoiPreview] = useState<PoiSelect | null>(null);
  const [mapFitKey, setMapFitKey] = useState(0);

  const mapInstanceRef = useRef<unknown>(null);
  const timelineColumnRef = useRef<HTMLDivElement | null>(null);
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
  const markerLookup = useMemo(() => {
    const map = new Map<string, { lng: number; lat: number; placeName: string }>();
    markers.forEach((marker) => {
      map.set(marker.id, { lng: marker.lng, lat: marker.lat, placeName: marker.placeName });
    });
    (activeDraft?.markerSnapshots ?? []).forEach((snapshot) => {
      map.set(snapshot.markerId, { lng: snapshot.lng, lat: snapshot.lat, placeName: snapshot.placeName });
    });
    return map;
  }, [markers, activeDraft]);
  const markerMetaById = useMemo(() => {
    const map = new Map<string, { budget?: number; note?: string; creatorNickname?: string }>();
    markers.forEach((marker) => {
      map.set(marker.id, {
        budget: marker.budget,
        note: marker.note,
        creatorNickname: marker.creatorNickname
      });
    });
    (activeDraft?.markerSnapshots ?? []).forEach((snapshot) => {
      if (!map.has(snapshot.markerId)) {
        map.set(snapshot.markerId, {
          budget: snapshot.budget,
          note: snapshot.note,
          creatorNickname: undefined
        });
      }
    });
    return map;
  }, [markers, activeDraft]);
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

  const draftItemsByDay = useMemo(() => {
    const grouped = new Map<number, PlanItemDraft[]>();
    if (!activeDraft) return grouped;
    activeDraft.planItems.forEach((item) => {
      const list = grouped.get(item.dayIndex) ?? [];
      list.push(item);
      grouped.set(
        item.dayIndex,
        list.sort(
          (a, b) =>
            (a.startMinutes ?? DEFAULT_START_MINUTES) - (b.startMinutes ?? DEFAULT_START_MINUTES) ||
            a.orderIndex - b.orderIndex
        )
      );
    });
    return grouped;
  }, [activeDraft]);
  const timelineItems = useMemo(() => (draftItemsByDay.get(activeTimelineDay) ?? []), [draftItemsByDay, activeTimelineDay]);

  const DAY_COLORS = ["#1d4ed8", "#2563eb", "#3b82f6", "#60a5fa", "#0ea5e9", "#0284c7", "#0369a1"];

  const timelineSchedule = useMemo(() => {
    return timelineItems.map((item) => {
      const start = Math.max(0, Math.min(DAY_MINUTES - MIN_DURATION_MINUTES, item.startMinutes ?? DEFAULT_START_MINUTES));
      const duration = Math.max(MIN_DURATION_MINUTES, Math.min(480, item.durationMinutes ?? item.stopMinutes ?? DEFAULT_STOP_MINUTES));
      const end = Math.min(DAY_MINUTES, start + duration);
      return { item, start, end, duration };
    });
  }, [timelineItems]);

  const routePaths = useMemo(() => {
    if (leftTab !== "snapshots") return undefined;
    if (!activeDraft || activeDraft.planItems.length === 0) return undefined;
    const routes: Array<{
      dayIndex: number;
      path: [number, number][];
      stops: Array<{ lng: number; lat: number; label: string; isFirst: boolean; isLast: boolean; stopMinutes: number }>;
      color: string;
    }> = [];
    draftItemsByDay.forEach((items, dayIndex) => {
      if (dayIndex !== activeTimelineDay) return;
      if (items.length < 2) return;
      const path: [number, number][] = [];
      const stops: Array<{ lng: number; lat: number; label: string; isFirst: boolean; isLast: boolean; stopMinutes: number }> = [];
      items.forEach((item, idx) => {
        const marker = markerLookup.get(item.markerId);
        if (marker) {
          path.push([marker.lng, marker.lat]);
          const stopMinutes = Math.max(15, item.stopMinutes ?? DEFAULT_STOP_MINUTES);
          stops.push({
            lng: marker.lng,
            lat: marker.lat,
            label: String(item.orderIndex),
            isFirst: idx === 0,
            isLast: idx === items.length - 1,
            stopMinutes
          });
        }
      });
      if (path.length >= 2) {
        routes.push({ dayIndex, path, stops, color: DAY_COLORS[(dayIndex - 1) % DAY_COLORS.length] });
      }
    });
    return routes.length > 0 ? routes : undefined;
  }, [activeDraft, draftItemsByDay, markerLookup, leftTab, activeTimelineDay]);

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

        // Phase 1: collect all data (no setState)
        const room = await api.getRoom(roomCode);
        if (disposed) return;

        let selfColor: string | undefined;
        if (memberId) {
          const members = await api.listMembers(roomCode);
          const selfData = members.find((m) => m.id === memberId);
          selfColor = selfData?.color;
        }

        const localDrafts = loadDrafts(roomCode);
        const [markerRows, plans] = await Promise.all([
          api.listMarkers(room.id),
          api.listPlans(room.id)
        ]);

        if (disposed) return;

        // Phase 2: apply all state in one synchronous block
        setRoomId(room.id);
        setRoomName(room.name ?? "");
        if (selfColor) setMemberColor(selfColor);
        setDrafts(localDrafts);
        setMarkers(markerRows);
        setSharedPlans(plans.map((p) => ({ id: p.id, title: p.title, creatorMemberId: p.creatorMemberId })));
        setMapFitKey((n) => n + 1);
        setLoading(false);
      } catch (e) {
        if (!disposed) {
          setError(e instanceof Error ? e.message : "初始化失败");
          setLoading(false);
        }
      }
    })();

    return () => {
      disposed = true;
    };
  }, [roomCode, memberId]);

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

  useEffect(() => {
    if (activeTimelineDay > activeDayCount) {
      setActiveTimelineDay(activeDayCount);
      return;
    }
    if (activeTimelineDay < 1) {
      setActiveTimelineDay(1);
    }
  }, [activeTimelineDay, activeDayCount]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  function normalizeOrder(items: PlanItemDraft[]) {
    return items
      .slice()
      .sort(
        (a, b) =>
          (a.startMinutes ?? DEFAULT_START_MINUTES) - (b.startMinutes ?? DEFAULT_START_MINUTES) ||
          a.orderIndex - b.orderIndex
      )
      .map((item, idx) => ({ ...item, orderIndex: idx + 1 }));
  }

  function getMinutesFromDropEvent(event: DragEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientY - rect.top) / rect.height;
    const minutes = Math.round(Math.max(0, Math.min(1, ratio)) * DAY_MINUTES);
    const snapped = Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
    return Math.max(0, Math.min(DAY_MINUTES - MIN_DURATION_MINUTES, snapped));
  }

  function snapMinutes(value: number) {
    return Math.round(value / SNAP_MINUTES) * SNAP_MINUTES;
  }

  function formatMinutes(totalMinutes: number) {
    const normalized = Math.max(0, Math.min(DAY_MINUTES, Math.round(totalMinutes)));
    const hours = Math.floor(normalized / 60);
    const minutes = normalized % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  function noteKey(dayIndex: number, markerId: string) {
    return `${dayIndex}:${markerId}`;
  }

  function shortNote(note: string, max = 60) {
    if (note.length <= max) return note;
    return `${note.slice(0, max)}...`;
  }

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
    setMapFitKey((n) => n + 1);
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
        dayIndex: Math.min(item.dayIndex, bounded),
        stopMinutes: item.stopMinutes ?? DEFAULT_STOP_MINUTES,
        startMinutes: item.startMinutes ?? DEFAULT_START_MINUTES,
        durationMinutes: item.durationMinutes ?? item.stopMinutes ?? DEFAULT_STOP_MINUTES
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
          .sort((a, b) => (a.startMinutes ?? DEFAULT_START_MINUTES) - (b.startMinutes ?? DEFAULT_START_MINUTES) || a.orderIndex - b.orderIndex)
          .forEach((item, idx) => normalized.push({ ...item, dayIndex: day, orderIndex: idx + 1 }));
      });
      return { ...draft, dayCount: bounded, planItems: normalized };
    });
  }

  function handleDropOnDay(markerId: string, dayIndex: number, startMinutes: number) {
    if (!activeDraft) return;

    updateActiveDraft((draft) => {
      const without = draft.planItems.filter((item) => item.markerId !== markerId);
      const dayItems = without.filter((item) => item.dayIndex === dayIndex);
      const existing = draft.planItems.find((item) => item.markerId === markerId && item.dayIndex === dayIndex);
      dayItems.push({
        markerId,
        dayIndex,
        orderIndex: dayItems.length + 1,
        stopMinutes: existing?.stopMinutes ?? DEFAULT_STOP_MINUTES,
        durationMinutes: existing?.durationMinutes ?? existing?.stopMinutes ?? DEFAULT_STOP_MINUTES,
        startMinutes
      });
      const normalized = normalizeOrder(dayItems);
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

  function applyPlanItemTime(markerId: string, dayIndex: number, startMinutes: number, endMinutes: number, withSnap = false) {
    let start = startMinutes;
    let end = endMinutes;
    if (withSnap) {
      start = snapMinutes(start);
      end = snapMinutes(end);
    }
    start = Math.max(0, Math.min(DAY_MINUTES - MIN_DURATION_MINUTES, start));
    end = Math.min(DAY_MINUTES, Math.max(start + MIN_DURATION_MINUTES, end));

    updateActiveDraft((draft) => {
      const updated = draft.planItems.map((item) =>
        item.markerId === markerId && item.dayIndex === dayIndex
          ? {
              ...item,
              startMinutes: start,
              durationMinutes: end - start,
              stopMinutes: end - start
            }
          : item
      );
      const dayItems = normalizeOrder(updated.filter((item) => item.dayIndex === dayIndex));
      const otherItems = updated.filter((item) => item.dayIndex !== dayIndex);
      return { ...draft, planItems: [...otherItems, ...dayItems] };
    });
  }

  useEffect(() => {
    if (!draggingTimeline) return;
    const drag = draggingTimeline;

    function handleMove(event: MouseEvent) {
      const column = timelineColumnRef.current;
      if (!column) return;
      const minutesPerPixel = DAY_MINUTES / column.clientHeight;
      const diffMinutes = (event.clientY - drag.startY) * minutesPerPixel;

      if (drag.mode === "move") {
        const duration = drag.originEnd - drag.originStart;
        let nextStart = drag.originStart + diffMinutes;
        nextStart = Math.max(0, Math.min(DAY_MINUTES - duration, nextStart));
        const nextEnd = nextStart + duration;
        applyPlanItemTime(drag.markerId, drag.dayIndex, nextStart, nextEnd, false);
        return;
      }

      if (drag.mode === "start") {
        const nextStart = Math.min(drag.originStart + diffMinutes, drag.originEnd - MIN_DURATION_MINUTES);
        applyPlanItemTime(drag.markerId, drag.dayIndex, nextStart, drag.originEnd, false);
        return;
      }

      const nextEnd = Math.max(drag.originEnd + diffMinutes, drag.originStart + MIN_DURATION_MINUTES);
      applyPlanItemTime(drag.markerId, drag.dayIndex, drag.originStart, nextEnd, false);
    }

    function handleUp() {
      const item = activeDraft?.planItems.find((p) => p.markerId === drag.markerId && p.dayIndex === drag.dayIndex);
      if (item) {
        const s = item.startMinutes ?? DEFAULT_START_MINUTES;
        const e = s + (item.durationMinutes ?? item.stopMinutes ?? DEFAULT_STOP_MINUTES);
        applyPlanItemTime(drag.markerId, drag.dayIndex, s, e, true);
      }
      setFrozenAnchorCenter(null);
      setDraggingTimeline(null);
    }

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [draggingTimeline, activeDraft]);

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
    setDraftForm(null);
    try {
      setSearching(true);
      setError("");
      const result = await searchPoi(mapInstanceRef.current, searchKeyword);
      if (result.items.length === 0) {
        setError("未找到匹配地点，请更换关键词");
        return;
      }
      setPoiSearchResults(result.items);
      setPoiSearchTotal(result.total);
      setPoiPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "搜索失败");
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    if (poiSearchResults.length === 0) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(".wb-search-row")) return;
      setPoiSearchResults([]);
      setPoiPreview(null);
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [poiSearchResults.length]);

  async function pushDraftToRoom() {
    if (!activeDraft || !roomId || !memberId) {
      setError("请先选择一个草稿，并确认你已加入房间");
      return;
    }
    if (activeDraft.planItems.length === 0) {
      setToast({ message: "编排内容为空，请先添加行程点", type: "error" });
      return;
    }

    try {
      setError("");
      const created = await api.createPlan(roomId, {
        creatorMemberId: memberId,
        title: memberNickname ? `${memberNickname} - ${activeDraft.title}` : activeDraft.title
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

      const itemsByDay = new Map<number, PlanItemDraft[]>();
      activeDraft.planItems.forEach((item) => {
        const list = itemsByDay.get(item.dayIndex) ?? [];
        list.push(item);
        itemsByDay.set(
          item.dayIndex,
          list.sort(
            (a, b) =>
              (a.startMinutes ?? DEFAULT_START_MINUTES) - (b.startMinutes ?? DEFAULT_START_MINUTES) ||
              a.orderIndex - b.orderIndex
          )
        );
      });

      for (const [dayIndex, dayItems] of itemsByDay) {
        for (const item of dayItems) {
          const usableMarkerId = markerIdMap.get(item.markerId) ?? item.markerId;
          const startMinutes = Math.max(0, Math.min(DAY_MINUTES - MIN_DURATION_MINUTES, item.startMinutes ?? DEFAULT_START_MINUTES));
          const durationMinutes = Math.max(MIN_DURATION_MINUTES, Math.min(480, item.durationMinutes ?? item.stopMinutes ?? DEFAULT_STOP_MINUTES));
          const startTime = new Date(Date.UTC(2026, 6, dayIndex, Math.floor(startMinutes / 60), startMinutes % 60, 0));
          const endMinutes = Math.min(DAY_MINUTES, startMinutes + durationMinutes);
          const endTime = new Date(Date.UTC(2026, 6, dayIndex, Math.floor(endMinutes / 60), endMinutes % 60, 0));

          await api.createPlanItem(created.id, {
            markerId: usableMarkerId,
            dayIndex,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            orderIndex: item.orderIndex
          });
        }
      }

      await refreshSharedPlans(roomId);
      setToast({ message: "推送成功，已加入共享方案列表", type: "success" });
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
        .map((item) => ({
          markerId: item.markerId,
          dayIndex: item.dayIndex,
          orderIndex: item.orderIndex,
          startMinutes: new Date(item.startTime).getUTCHours() * 60 + new Date(item.startTime).getUTCMinutes(),
          durationMinutes: Math.max(
            MIN_DURATION_MINUTES,
            Math.round((new Date(item.endTime).getTime() - new Date(item.startTime).getTime()) / 60000)
          ),
          stopMinutes: DEFAULT_STOP_MINUTES
        }));

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
      setMapFitKey((n) => n + 1);
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
      const normalized = items.map((item) => ({
        markerId: item.markerId,
        dayIndex: item.dayIndex,
        orderIndex: item.orderIndex,
        startMinutes: new Date(item.startTime).getUTCHours() * 60 + new Date(item.startTime).getUTCMinutes(),
        durationMinutes: Math.max(
          MIN_DURATION_MINUTES,
          Math.round((new Date(item.endTime).getTime() - new Date(item.startTime).getTime()) / 60000)
        ),
        stopMinutes: DEFAULT_STOP_MINUTES
      }));
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

  function getNextUnnamedPlaceName() {
    const unnamedNames = markers
      .map((marker) => marker.placeName.trim())
      .filter((name) => name === "未命名地点" || /^未命名地点\d+$/.test(name));
    if (unnamedNames.length === 0) return "未命名地点1";
    let maxIndex = 0;
    unnamedNames.forEach((name) => {
      const matched = name.match(/^未命名地点(\d+)$/);
      if (matched) {
        maxIndex = Math.max(maxIndex, Number(matched[1]));
      }
    });
    return `未命名地点${maxIndex + 1}`;
  }

  return (
    <div className="app-bg workbench-shell">
      <div className="orb orb-a" />
      <div className="orb orb-b" />

      <motion.header className="wb-header" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div>
          <h1>{roomName || "未命名房间"}</h1>
        </div>
        <div className="wb-header-right">
          <div className="room-code-inline">
            <span className="room-code-label">房间码</span>
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
          </div>
          <Link className="btn" to={`/rooms/${roomCode}/vote?memberId=${memberId}&nickname=${encodeURIComponent(memberNickname)}`}>共享方案列表</Link>
          <button className="btn" onClick={() => {
            if (window.confirm("确定要退出当前房间吗？")) {
              window.location.href = "/";
            }
          }}>退出房间</button>
        </div>
      </motion.header>

      {loading ? <p className="page-note wb-message">加载中...</p> : null}
      {error ? <p className="error-text wb-message">{error}</p> : null}
      {toast && (
        <div className={`toast toast-${toast.type}`}>{toast.message}</div>
      )}

      <motion.div className="wb-layout" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.05 }}>
        <aside className="wb-left">
          <div className="wb-tabs">
            <button className={leftTab === "markers" ? "wb-tab active" : "wb-tab"} onClick={() => { setLeftTab("markers"); setMapFitKey((n) => n + 1); }}>地点池</button>
            <button className={leftTab === "snapshots" ? "wb-tab active" : "wb-tab"} onClick={() => { setLeftTab("snapshots"); setMapFitKey((n) => n + 1); }}>方案管理</button>
          </div>

          {leftTab === "markers" ? (
            <div className="wb-panel">
              <div className="wb-search-row">
                <div className="search-input-wrap">
                  <input value={searchKeyword} onChange={(event) => setSearchKeyword(event.target.value)} placeholder="搜索地点，如：紫禁城" />
                  {(searchKeyword || poiSearchResults.length > 0) ? (
                    <button className="search-clear" onClick={() => { setSearchKeyword(""); setPoiSearchResults([]); setPoiPreview(null); }}>×</button>
                  ) : null}
                </div>
                <button className="btn btn-primary btn-sm" disabled={searching} onClick={handleSearch}>{searching ? "搜索中" : "搜索"}</button>

                {!snapshotMode && poiSearchResults.length > 0 ? (
                  <div className="poi-dropdown">
                    <h4>搜索结果（{poiSearchTotal} 条）</h4>
                    <p className="page-note">点击预览地点，再次点击确认选定</p>
                    <ul className="poi-result-list">
                      {poiSearchResults.map((poi, idx) => (
                        <li key={poi.poiId || idx}>
                          <button
                            className={`poi-result-item${poiPreview?.poiId === poi.poiId ? " active" : ""}`}
                            onClick={() => {
                              if (poiPreview?.poiId === poi.poiId) {
                                setDraftForm({ placeName: poi.placeName, lng: poi.lng, lat: poi.lat, address: poi.address, poiId: poi.poiId });
                                setPoiSearchResults([]);
                                setPoiPreview(null);
                              } else {
                                setPoiPreview(poi);
                                const map = mapInstanceRef.current as { setCenter: (p: [number, number]) => void; setZoom: (z: number) => void } | null;
                                if (map) {
                                  map.setCenter([poi.lng, poi.lat]);
                                  map.setZoom(15);
                                }
                              }
                            }}
                          >
                            <strong>{poi.placeName}</strong>
                            <small>{poi.address}</small>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>

              <div className="snapshot-entry">
                {!snapshotMode ? (
                  <button className="btn btn-primary snapshot-mode-btn" onClick={() => { setSnapshotMode(true); setSelectedForSnapshot([]); setDraftForm(null); setError(""); setLeftTab("snapshots"); setMapFitKey((n) => n + 1); if (drafts.length > 0) setActiveDraftId(drafts[0].id); }}>
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

              <div className="wb-panel-scroll">
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

              <div className="wb-panel-scroll">
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
            </div>
          )}
        </aside>

        <main className="wb-center">
          {routePaths && routePaths.length > 0 ? (
            <div className="route-legend-card">
              <strong>路线图例</strong>
              <div className="route-legend-list">
                {routePaths.map((route) => (
                  <span key={`legend-${route.dayIndex}`} className="route-legend-item">
                    <i style={{ background: route.color }} />
                    第{route.dayIndex}天 · {route.stops.length}站
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          <MapCanvas
            markers={markersForMap}
            routePaths={routePaths}
            fitKey={mapFitKey}
            draftMarker={draftForm ? { lng: draftForm.lng, lat: draftForm.lat } : null}
            draftMarkerColor={memberColor}
            poiPreviewMarker={poiPreview ? { lng: poiPreview.lng, lat: poiPreview.lat, placeName: poiPreview.placeName } : null}
            allowCreateMarker={leftTab === "markers" && !snapshotMode}
            onMapReady={(map) => {
              mapInstanceRef.current = map;
            }}
            onMapClick={(lng, lat, address) => {
              if (snapshotMode || leftTab !== "markers") {
                setError("方案管理中不可新增标点，请先切回地点池");
                return;
              }
              const trimmedAddress = (address || "").trim();
              const placeName = trimmedAddress || getNextUnnamedPlaceName();
              setDraftForm({ placeName, lng, lat, address: trimmedAddress || undefined });
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
              <p className="page-note">拖入时间轴后，可直接拖动时间段本体调整位置，拖上边缘改开始，拖下边缘改结束。</p>

              <div className="timeline-day-switch">
                <p>第 {activeTimelineDay} 天</p>
                <input
                  type="range"
                  min={1}
                  max={activeDayCount}
                  value={activeTimelineDay}
                  onChange={(event) => setActiveTimelineDay(Number(event.target.value))}
                />
              </div>

              <div
                ref={timelineColumnRef}
                className={dropTarget?.dayIndex === activeTimelineDay ? "day-column timeline-column drop-target" : "day-column timeline-column"}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDropTarget({ dayIndex: activeTimelineDay });
                }}
                onDragLeave={() => {
                  setDropTarget((prev) => (prev?.dayIndex === activeTimelineDay ? null : prev));
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const markerId = event.dataTransfer.getData("markerId");
                  if (markerId) {
                    handleDropOnDay(markerId, activeTimelineDay, getMinutesFromDropEvent(event));
                  }
                  setDropTarget(null);
                }}
              >
                {timelineSchedule.length === 0 ? (
                  <p className="day-hint">{dropTarget?.dayIndex === activeTimelineDay ? "松开插入时间轴" : "拖入地点开始当天行程"}</p>
                ) : null}
                <div className="timeline-grid-overlay">
                  {Array.from({ length: 7 }, (_, idx) => idx * 4).map((hour) => (
                    <div key={`axis-${hour}`} className="timeline-axis-row" style={{ top: `${(hour / 24) * 100}%` }}>
                      <span>{hour}</span>
                    </div>
                  ))}
                  {Array.from({ length: 6 }, (_, idx) => idx * 4 + 2).map((hour) => (
                    <div key={`axis-minor-${hour}`} className="timeline-axis-row minor" style={{ top: `${(hour / 24) * 100}%` }} />
                  ))}
                </div>
                {timelineSchedule.map((entry) => {
                  const item = entry.item;
                  const startPercent = (entry.start / DAY_MINUTES) * 100;
                  const centerPercent = ((entry.start + entry.end) / 2 / DAY_MINUTES) * 100;
                  const segmentHeight = Math.max(14, ((entry.end - entry.start) / DAY_MINUTES) * TIMELINE_PIXEL_HEIGHT);
                  const isDraggingThis = draggingTimeline?.markerId === item.markerId && draggingTimeline?.dayIndex === activeTimelineDay;
                  const anchorPercent = isDraggingThis && draggingTimeline?.mode !== "move" && frozenAnchorCenter !== null
                    ? (frozenAnchorCenter / DAY_MINUTES) * 100
                    : centerPercent;
                  return (
                    <div key={`${item.markerId}-${item.dayIndex}`}>
                      <div className="timeline-segment-wrap" style={{ top: `${startPercent}%`, height: `${segmentHeight}px` }}>
                        <button
                          type="button"
                          className="timeline-segment-handle top"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            setFrozenAnchorCenter((entry.start + entry.end) / 2);
                            setDraggingTimeline({
                              markerId: item.markerId,
                              dayIndex: activeTimelineDay,
                              mode: "start",
                              startY: event.clientY,
                              originStart: entry.start,
                              originEnd: entry.end
                            });
                          }}
                        />
                        <button
                          type="button"
                          className="timeline-segment"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            setFrozenAnchorCenter(null);
                            setDraggingTimeline({
                              markerId: item.markerId,
                              dayIndex: activeTimelineDay,
                              mode: "move",
                              startY: event.clientY,
                              originStart: entry.start,
                              originEnd: entry.end
                            });
                          }}
                        />
                        <button
                          type="button"
                          className="timeline-segment-handle bottom"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            setFrozenAnchorCenter((entry.start + entry.end) / 2);
                            setDraggingTimeline({
                              markerId: item.markerId,
                              dayIndex: activeTimelineDay,
                              mode: "end",
                              startY: event.clientY,
                              originStart: entry.start,
                              originEnd: entry.end
                            });
                          }}
                        />
                      </div>
                      <div className="timeline-item-row" style={{ top: `${anchorPercent}%` }}>
                        <span className="timeline-link-dot" />
                      <article className="timeline-event-card">
                        <strong>{item.orderIndex}. {getMarkerName(item.markerId)}</strong>
                        <small>{formatMinutes(entry.start)}-{formatMinutes(entry.end)}</small>
                        {(() => {
                          const meta = markerMetaById.get(item.markerId);
                          const budgetText = meta?.budget !== undefined ? `¥${meta.budget}` : "-";
                          const creatorText = meta?.creatorNickname ?? "未知";
                          const noteText = (meta?.note ?? "").trim();
                          const key = noteKey(activeTimelineDay, item.markerId);
                          const expanded = Boolean(expandedNotes[key]);
                          const longNote = noteText.length > 60;
                          const inlineNote = noteText ? (expanded ? noteText : shortNote(noteText, 60)) : "-";
                          return (
                            <>
                              <small className="timeline-meta-line">
                                预算 {budgetText} · 创建者 {creatorText} · 备注 {inlineNote}
                                {longNote ? (
                                  <button
                                    type="button"
                                    className="timeline-note-toggle"
                                    onClick={() => setExpandedNotes((prev) => ({ ...prev, [key]: !expanded }))}
                                  >
                                    {expanded ? "收起" : "展开"}
                                  </button>
                                ) : null}
                              </small>
                            </>
                          );
                        })()}
                      </article>
                      <button className="item-remove" onClick={() => removePlanItem(item.markerId, activeTimelineDay)}>×</button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="wb-actions">
                <button className="btn btn-primary" onClick={pushDraftToRoom}>推送给其他用户查看</button>
                <button className="btn" onClick={() => deleteDraft(activeDraft.id)}>删除当前草稿</button>
              </div>
            </>
          )}
        </aside>
      </motion.div>
    </div>
  );
}
