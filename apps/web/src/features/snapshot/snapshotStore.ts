export interface PlanItemDraft {
  markerId: string;
  dayIndex: number;
  orderIndex: number;
  stopMinutes?: number;
}

export interface SnapshotMarker {
  markerId: string;
  placeName: string;
  lng: number;
  lat: number;
  budget?: number;
  note?: string;
  address?: string;
  poiId?: string;
}

export interface DraftSnapshot {
  id: string;
  roomCode: string;
  title: string;
  sourcePlanId?: string;
  dayCount?: number;
  markerIds?: string[];
  markerSnapshots?: SnapshotMarker[];
  planItems: PlanItemDraft[];
  createdAt: string;
  updatedAt: string;
}

function getKey(roomCode: string) {
  return `tp_draft_${roomCode}`;
}

export function loadDrafts(roomCode: string): DraftSnapshot[] {
  try {
    const raw = localStorage.getItem(getKey(roomCode));
    return raw ? (JSON.parse(raw) as DraftSnapshot[]) : [];
  } catch {
    return [];
  }
}

export function saveDrafts(roomCode: string, drafts: DraftSnapshot[]) {
  try {
    localStorage.setItem(getKey(roomCode), JSON.stringify(drafts));
  } catch {
    // storage full, ignore
  }
}

export function createDraft(roomCode: string, title?: string): DraftSnapshot {
  return {
    id: crypto.randomUUID(),
    roomCode,
    title: title ?? `方案 ${new Date().toLocaleString("zh-CN")}`,
    dayCount: 3,
    markerIds: [],
    markerSnapshots: [],
    planItems: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}
