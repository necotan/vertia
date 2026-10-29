import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useSyncExternalStore } from "react";

const WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";

export async function loadMapLibre(): Promise<typeof import("maplibre-gl")> {
  const maplibre = await import("maplibre-gl");
  // 相対 URL は Worker 側で解決できない
  maplibre.setWorkerUrl(new URL(WORKER_URL, window.location.href).href);
  // Worker を使い回し、2回目以降の地図の生成を速くする
  maplibre.prewarm();
  return maplibre;
}

// OpenFreeMap の dark スタイルが sprite にない画像（wood-pattern）を参照して警告が出るため、透明な画像で埋める
export function fillMissingStyleImages(map: MapLibreMap): void {
  map.setMissingStyleImageResolver((id) => {
    if (!map.hasImage(id)) map.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
  });
}

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

// Safari は画面上部のぼかしをページの背景色で色づけるため
export function useMapPageBackground(color: string | null): void {
  useEffect(() => {
    if (color === null) return;
    const targets = [document.documentElement, document.body];
    const previous = targets.map((element) => element.style.backgroundColor);
    for (const element of targets) element.style.backgroundColor = color;
    return () => {
      targets.forEach((element, index) => {
        element.style.backgroundColor = previous[index];
      });
    };
  }, [color]);
}
