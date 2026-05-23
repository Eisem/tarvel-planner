let loader: Promise<void> | null = null;

export function loadAMap() {
  if ((window as typeof window & { AMap?: unknown }).AMap) {
    return Promise.resolve();
  }
  if (loader) return loader;

  const key = import.meta.env.VITE_AMAP_JS_KEY;
  if (!key) {
    return Promise.reject(new Error("缺少 VITE_AMAP_JS_KEY，请先在 .env.local 配置高德 Key"));
  }

  loader = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${key}&plugin=AMap.PlaceSearch,AMap.Geocoder,AMap.ToolBar`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("高德地图脚本加载失败"));
    document.head.appendChild(script);
  });

  return loader;
}
