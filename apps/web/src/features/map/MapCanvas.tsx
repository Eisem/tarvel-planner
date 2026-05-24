import { useEffect, useRef, useState } from "react";
import { getAMapWebKey, loadAMap } from "./amap";
import type { MarkerRow } from "../../services/api";

export interface PoiSelect {
  placeName: string;
  lng: number;
  lat: number;
  address?: string;
  poiId?: string;
}

export interface PoiSearchResult {
  first: PoiSelect | null;
  total: number;
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
  draftMarker?: { lng: number; lat: number } | null;
  draftMarkerColor?: string;
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
    Pixel: new (x: number, y: number) => unknown;
    InfoWindow: new (o: Record<string, unknown>) => { setContent: (c: string) => void; open: (m: unknown, p: unknown) => void; close: () => void };
    PlaceSearch: new (o: Record<string, unknown>) => { search: (kw: string, cb: (s: string, r: Record<string, unknown>) => void) => void };
  }
};

function markerIcon(color: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='34' viewBox='0 0 24 34'><path fill='${color}' d='M12 0C5.373 0 0 5.33 0 11.906c0 8.633 12 22.094 12 22.094s12-13.461 12-22.094C24 5.33 18.627 0 12 0z'/><circle cx='12' cy='12' r='4.8' fill='white'/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function MapCanvas({ markers, draftMarker, draftMarkerColor, onMapReady, onMapClick, onMarkerClick }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<MapObj | null>(null);
  const makerRef = useRef<Map<string, InstanceType<typeof win.AMap.Marker>>>(new Map());
  const infoWindowRef = useRef<InstanceType<typeof win.AMap.InfoWindow> | null>(null);
  const draftMarkerRef = useRef<InstanceType<typeof win.AMap.Marker> | null>(null);
  const [mapReady, setMapReady] = useState(false);

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
        setMapReady(true);
        onMapReady(map);

        map.on("click", (e) => {
          if (infoWindowRef.current) {
            infoWindowRef.current.close();
          }
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
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    makerRef.current.forEach((m) => m.setMap(null));
    makerRef.current.clear();
    markers.forEach((row) => {
      const mk = new win.AMap.Marker({ position: [row.lng, row.lat], title: row.placeName, icon: markerIcon(row.color ?? "#3b82f6"), offset: new win.AMap.Pixel(-12, -34) });
      mk.setMap(map);
      mk.on("click", () => {
        onMarkerClick(row);
        renderInfoWindow(row);
      });
      makerRef.current.set(row.id, mk);
    });
  }, [markers, mapReady]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (draftMarkerRef.current) {
      draftMarkerRef.current.setMap(null);
      draftMarkerRef.current = null;
    }
    if (!draftMarker) return;
    const mk = new win.AMap.Marker({ position: [draftMarker.lng, draftMarker.lat], title: "待保存标点", icon: markerIcon(draftMarkerColor ?? "#ef4444"), offset: new win.AMap.Pixel(-12, -34) });
    mk.setMap(map);
    draftMarkerRef.current = mk;
  }, [draftMarker, draftMarkerColor]);

  return <div className="amap-canvas workbench-map" ref={mapRef} />;
}

export async function searchPoi(mapInstance: unknown, keyword: string, onSelect: (poi: PoiSelect) => void): Promise<PoiSearchResult> {
  const trimmed = keyword.trim();
  if (!trimmed) {
    return { first: null, total: 0 };
  }

  const mi = mapInstance as MapObj | null;
  const webKey = getAMapWebKey();

  if (webKey) {
    const url = `https://restapi.amap.com/v3/place/text?key=${encodeURIComponent(webKey)}&keywords=${encodeURIComponent(trimmed)}&offset=10&page=1&extensions=base`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("高德搜索服务不可用");
    }
    const data = (await response.json()) as {
      status?: string;
      info?: string;
      count?: string;
      pois?: Array<{ id?: string; name?: string; address?: string; location?: string }>;
    };
    if (data.status !== "1") {
      throw new Error(data.info || "高德搜索失败");
    }

    const first = data.pois?.[0];
    if (!first?.location) {
      return { first: null, total: Number(data.count || 0) };
    }
    const [lngText, latText] = first.location.split(",");
    const lng = Number(lngText);
    const lat = Number(latText);
    const poi: PoiSelect = {
      placeName: first.name || trimmed,
      lng,
      lat,
      address: first.address,
      poiId: first.id
    };
    onSelect(poi);
    if (mi) {
      mi.setCenter([lng, lat]);
      mi.setZoom(14);
    }
    return { first: poi, total: Number(data.count || 1) };
  }

  if (!mapInstance) {
    throw new Error("地图尚未加载完成");
  }

  await new Promise<void>((resolve, reject) => {
    const ps = new win.AMap.PlaceSearch({ map: mapInstance });
    ps.search(trimmed, (_s, r) => {
      const pois = (r?.poiList as Record<string, unknown> | undefined)?.pois as Array<Record<string, unknown>> | undefined;
      const first = pois?.[0];
      if (!first) {
        resolve();
        return;
      }
      const loc = first.location as { lng: number; lat: number };
      const poi = {
        placeName: first.name as string,
        lng: loc.lng,
        lat: loc.lat,
        address: first.address as string | undefined,
        poiId: first.id as string | undefined
      };
      onSelect(poi);
      if (mi) {
        mi.setCenter([loc.lng, loc.lat]);
        mi.setZoom(14);
      }
      resolve();
    });
    setTimeout(() => reject(new Error("地点搜索超时")), 8000);
  });

  return { first: null, total: 0 };
}
