import { useEffect, useRef } from "react";
import { loadAMap } from "./amap";
import type { MarkerRow } from "../../services/api";

export interface PoiSelect {
  placeName: string;
  lng: number;
  lat: number;
  address?: string;
  poiId?: string;
}

interface MapObj {
  destroy: () => void;
  addControl: (c: unknown) => void;
  on: (evt: string, fn: (e: Record<string, unknown>) => void) => void;
  setCenter: (p: [number, number]) => void;
  setZoom: (z: number) => void;
}

interface Props {
  markers: MarkerRow[];
  onMapReady: (mapInstance: MapObj) => void;
  onMapClick: (lng: number, lat: number, address: string) => void;
  onMarkerClick: (marker: MarkerRow) => void;
}

const win = window as unknown as {
  AMap: {
    Map: new (c: HTMLDivElement, o: Record<string, unknown>) => MapObj;
    ToolBar: new () => unknown;
    Geocoder: new () => { getAddress: (pos: number[], cb: (s: string, r: Record<string, unknown>) => void) => void };
    Marker: new (o: Record<string, unknown>) => { setMap: (m: unknown) => void; on: (e: string, fn: () => void) => void; getPosition: () => unknown };
    InfoWindow: new (o: Record<string, unknown>) => { setContent: (c: string) => void; open: (m: unknown, p: unknown) => void };
    PlaceSearch: new (o: Record<string, unknown>) => { search: (kw: string, cb: (s: string, r: Record<string, unknown>) => void) => void };
  }
};

export function MapCanvas({ markers, onMapReady, onMapClick, onMarkerClick }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<MapObj | null>(null);
  const makerRef = useRef<Map<string, InstanceType<typeof win.AMap.Marker>>>(new Map());
  const infoWindowRef = useRef<InstanceType<typeof win.AMap.InfoWindow> | null>(null);

  function escapeText(v: string | number | undefined) {
    if (v === undefined || v === null) return "-";
    return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderInfoWindow(row: MarkerRow) {
    const map = mapInstanceRef.current;
    const mk = makerRef.current.get(row.id);
    if (!map || !mk) return;
    if (!infoWindowRef.current) {
      infoWindowRef.current = new win.AMap.InfoWindow({ offset: { x: 0, y: -30 } });
    }
    infoWindowRef.current.setContent(`
      <div style="min-width:200px;padding:2px 0;line-height:1.5;">
        <div style="font-weight:700;margin-bottom:4px;">${escapeText(row.placeName)}</div>
        <div>预算：${escapeText(row.budget)}</div>
        <div>备注：${escapeText(row.note)}</div>
        <div>坐标：${row.lng.toFixed(5)}, ${row.lat.toFixed(5)}</div>
      </div>
    `);
    infoWindowRef.current.open(map, mk.getPosition());
  }

  useEffect(() => {
    let disposed = false;
    async function init() {
      try {
        await loadAMap();
        if (disposed || !mapRef.current) return;
        const map = new win.AMap.Map(mapRef.current, { zoom: 11, center: [116.397428, 39.90923] });
        map.addControl(new win.AMap.ToolBar());
        mapInstanceRef.current = map;
        onMapReady(map);

        map.on("click", (e) => {
          const lnglat = e.lnglat as { getLng: () => number; getLat: () => number };
          const lng = lnglat.getLng();
          const lat = lnglat.getLat();
          new win.AMap.Geocoder().getAddress([lng, lat], (_s, r) => {
            const addr = (r?.regeocode as Record<string, unknown> | undefined)?.formattedAddress as string | undefined;
            onMapClick(lng, lat, addr ?? "未命名地点");
          });
        });
      } catch { /* ignored */ }
    }
    init();
    return () => {
      disposed = true;
      mapInstanceRef.current?.destroy();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    makerRef.current.forEach((m) => m.setMap(null));
    makerRef.current.clear();
    markers.forEach((row) => {
      const mk = new win.AMap.Marker({ position: [row.lng, row.lat], title: row.placeName });
      mk.setMap(map);
      mk.on("click", () => {
        onMarkerClick(row);
        renderInfoWindow(row);
      });
      makerRef.current.set(row.id, mk);
    });
  }, [markers]);

  return <div className="amap-canvas workbench-map" ref={mapRef} />;
}

export function searchPoi(mapInstance: unknown, keyword: string, onSelect: (poi: PoiSelect) => void) {
  if (!keyword.trim() || !mapInstance) return;
  const ps = new win.AMap.PlaceSearch({ map: mapInstance });
  const mi = mapInstance as MapObj;
  ps.search(keyword.trim(), (_s, r) => {
    const pois = (r?.poiList as Record<string, unknown> | undefined)?.pois as Array<Record<string, unknown>> | undefined;
    const first = pois?.[0];
    if (!first) return;
    const loc = first.location as { lng: number; lat: number };
    onSelect({
      placeName: first.name as string,
      lng: loc.lng,
      lat: loc.lat,
      address: first.address as string | undefined,
      poiId: first.id as string | undefined
    });
    mi.setCenter([loc.lng, loc.lat]);
    mi.setZoom(14);
  });
}
