import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../services/api";
import { joinRoomRealtime, leaveRoomRealtime, socket } from "../../services/socket";
import { loadAMap } from "./amap";

type Draft = {
  placeName: string;
  lng: number;
  lat: number;
  address?: string;
  poiId?: string;
  budget?: number;
  note?: string;
};

export function MarkMapPanel({ roomCode, memberId }: { roomCode: string; memberId: string }) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerListRef = useRef<any[]>([]);
  const markerByIdRef = useRef<Record<string, any>>({});
  const infoWindowRef = useRef<any>(null);
  const roomIdRef = useRef<string>("");

  const [roomId, setRoomId] = useState<string>("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [markers, setMarkers] = useState<Array<{ id: string; placeName: string; lng: number; lat: number; note?: string; budget?: number }>>([]);
  const [selectedMarkerId, setSelectedMarkerId] = useState("");

  const canSave = useMemo(() => Boolean(roomId && memberId && draft?.placeName?.trim()), [roomId, memberId, draft?.placeName]);

  function escapeText(value: string | number | undefined) {
    if (value === undefined || value === null) return "-";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function openMarkerInfo(row: { id: string; placeName: string; lng: number; lat: number; note?: string; budget?: number }) {
    const map = mapInstanceRef.current;
    const markerObj = markerByIdRef.current[row.id];
    const AMap = (window as any).AMap;
    if (!map || !markerObj || !AMap) return;

    if (!infoWindowRef.current) {
      infoWindowRef.current = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -30) });
    }

    const content = `
      <div style="min-width:200px;padding:2px 0;line-height:1.5;">
        <div style="font-weight:700;margin-bottom:4px;">${escapeText(row.placeName)}</div>
        <div>预算：${escapeText(row.budget)}</div>
        <div>备注：${escapeText(row.note)}</div>
        <div>坐标：${row.lng.toFixed(5)}, ${row.lat.toFixed(5)}</div>
      </div>
    `;

    infoWindowRef.current.setContent(content);
    infoWindowRef.current.open(map, markerObj.getPosition());
    setSelectedMarkerId(row.id);
  }

  async function refreshMarkers(currentRoomId: string, mapObj?: any) {
    const rows = await api.listMarkers(currentRoomId);
    setMarkers(rows);
    const map = mapObj ?? mapInstanceRef.current;
    if (!map) return;
    markerListRef.current.forEach((m) => map.remove(m));
    markerByIdRef.current = {};
    markerListRef.current = rows.map((row) => {
      const marker = new (window as any).AMap.Marker({ position: [row.lng, row.lat], title: row.placeName });
      marker.setMap(map);
      marker.on("click", () => openMarkerInfo(row));
      markerByIdRef.current[row.id] = marker;
      return marker;
    });
  }

  useEffect(() => {
    let disposed = false;
    async function bootstrap() {
      try {
        setLoading(true);
        const room = await api.getRoom(roomCode);
        if (disposed) return;
        setRoomId(room.id);
        roomIdRef.current = room.id;

        await loadAMap();
        if (disposed || !mapRef.current) return;

        const AMap = (window as any).AMap;
        const map = new AMap.Map(mapRef.current, {
          zoom: 11,
          center: [116.397428, 39.90923]
        });
        map.addControl(new AMap.ToolBar());
        mapInstanceRef.current = map;

        map.on("click", (e: any) => {
          const lng = e.lnglat.getLng();
          const lat = e.lnglat.getLat();
          const geocoder = new AMap.Geocoder();
          geocoder.getAddress([lng, lat], (_status: string, result: any) => {
            const address = result?.regeocode?.formattedAddress;
            setDraft({ placeName: address || "未命名地点", address, lng, lat });
          });
        });

        await refreshMarkers(room.id, map);
      } catch (e) {
        const message = e instanceof Error ? e.message : "地图初始化失败";
        setError(message);
      } finally {
        if (!disposed) setLoading(false);
      }
    }
    bootstrap();

    return () => {
      disposed = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, [roomCode]);

  useEffect(() => {
    if (!roomCode || !memberId) return;

    joinRoomRealtime(roomCode, memberId);

    const onMarkerChanged = async () => {
      const activeRoomId = roomIdRef.current;
      if (!activeRoomId) return;
      try {
        await refreshMarkers(activeRoomId);
      } catch {
        // ignore transient sync failures
      }
    };

    socket.on("marker.created", onMarkerChanged);
    socket.on("marker.updated", onMarkerChanged);
    socket.on("marker.deleted", onMarkerChanged);

    return () => {
      socket.off("marker.created", onMarkerChanged);
      socket.off("marker.updated", onMarkerChanged);
      socket.off("marker.deleted", onMarkerChanged);
      leaveRoomRealtime(roomCode, memberId);
    };
  }, [roomCode, memberId]);

  function searchPoi() {
    if (!searchKeyword.trim() || !mapInstanceRef.current) return;
    const AMap = (window as any).AMap;
    const placeSearch = new AMap.PlaceSearch({ map: mapInstanceRef.current });
    placeSearch.search(searchKeyword.trim(), (_status: string, result: any) => {
      const first = result?.poiList?.pois?.[0];
      if (!first) return;
      const lng = first.location.lng;
      const lat = first.location.lat;
      setDraft({ placeName: first.name, lng, lat, address: first.address, poiId: first.id });
      mapInstanceRef.current.setCenter([lng, lat]);
      mapInstanceRef.current.setZoom(14);
    });
  }

  async function saveDraft() {
    if (!draft || !canSave) return;
    try {
      if (!memberId) {
        setError("缺少成员标识，请从首页重新进入房间后再保存。");
        return;
      }
      setSaving(true);
      await api.createMarker(roomId, {
        memberId,
        placeName: draft.placeName.trim(),
        lng: draft.lng,
        lat: draft.lat,
        address: draft.address,
        poiId: draft.poiId,
        budget: draft.budget,
        note: draft.note
      });
      await refreshMarkers(roomId);
      setDraft(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "保存失败";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="amap-panel">
      <div className="amap-toolbar">
        <input value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} placeholder="搜索地点，如：紫禁城" />
        <button className="btn" onClick={searchPoi}>搜索地点</button>
      </div>
      {!memberId ? <p className="error-text">当前链接缺少成员信息，建议从首页重新进入房间。</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      {loading ? <p className="page-note">地图加载中...</p> : null}
      <div className="mark-layout">
        <div className="amap-canvas" ref={mapRef} />
        <aside className="marker-list">
          <h4>已标点列表</h4>
          {markers.length === 0 ? (
            <p className="page-note">还没有标点，先在地图上点击或搜索地点。</p>
          ) : (
            <ul>
              {markers.map((row) => (
                <li key={row.id}>
                  <button
                    className={selectedMarkerId === row.id ? "marker-item active" : "marker-item"}
                    onClick={() => {
                      const map = mapInstanceRef.current;
                      if (map) {
                        map.setCenter([row.lng, row.lat]);
                        map.setZoom(14);
                      }
                      openMarkerInfo(row);
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
        </aside>
      </div>

      <article className="draft-box">
        <h4>标点编辑</h4>
        {!draft ? (
          <p className="page-note">点击地图或搜索结果后可编辑并保存。</p>
        ) : (
          <div className="draft-grid">
            <label>
              <span>地点名称</span>
              <input value={draft.placeName} onChange={(e) => setDraft({ ...draft, placeName: e.target.value })} />
            </label>
            <label>
              <span>预算（可选）</span>
              <input
                type="number"
                value={draft.budget ?? ""}
                onChange={(e) => setDraft({ ...draft, budget: e.target.value ? Number(e.target.value) : undefined })}
              />
            </label>
            <label>
              <span>备注（可选）</span>
              <input value={draft.note ?? ""} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
            </label>
            <p className="page-note">坐标：{draft.lng.toFixed(6)}, {draft.lat.toFixed(6)}</p>
            <button className="btn btn-primary" disabled={!canSave || saving} onClick={saveDraft}>
              {saving ? "保存中..." : "保存标点"}
            </button>
          </div>
        )}
      </article>
    </div>
  );
}
