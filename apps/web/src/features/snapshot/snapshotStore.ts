export interface PlanItemDraft {
  markerId: string;
  dayIndex: number;
  orderIndex: number;
}

export interface DraftSnapshot {
  id: string;
  roomCode: string;
  title: string;
  sourcePlanId?: string;
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
    planItems: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}
