"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { GpsPoint } from "@/lib/db/schema";
import { GPS_ACCURACY_LIMIT_M } from "@/lib/drive/liveStats";

const WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";
const ATTRIBUTION_COLLAPSE_MS = 5000;

const STYLE_URLS = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
} as const;

const ROUTE_COLORS = {
  light: { line: "#171717", casing: "#ffffff" },
  dark: { line: "#fafafa", casing: "#0a0a0a" },
} as const;

type Coordinate = [number, number];

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function SessionMap({ points }: { points: GpsPoint[] }) {
  const t = useTranslations("sessions.detail.map");
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  // 地図のタイルは保存しないため、オフラインのときは地図の代わりにメッセージを出す
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

  const coordinates = useMemo<Coordinate[]>(
    () => points.filter((p) => p.accuracy <= GPS_ACCURACY_LIMIT_M).map((p) => [p.lng, p.lat]),
    [points],
  );

  const locale = useMemo<Record<string, string>>(
    () => ({
      "CooperativeGesturesHandler.MobileHelpText": t("gestureMobile"),
      "CooperativeGesturesHandler.WindowsHelpText": t("gestureWindows"),
      "CooperativeGesturesHandler.MacHelpText": t("gestureMac"),
    }),
    [t],
  );

  // next-themes はマウント前に undefined を返すため、テーマが決まってから地図を描画する
  const theme = resolvedTheme === undefined ? undefined : resolvedTheme === "dark" ? "dark" : "light";

  useEffect(() => {
    const container = containerRef.current;
    if (!container || coordinates.length === 0 || theme === undefined || !online) return;

    let map: MapLibreMap | null = null;
    let cancelled = false;
    let collapseTimer: ReturnType<typeof setTimeout> | undefined;

    void import("maplibre-gl").then(({ Map, LngLatBounds, setWorkerUrl }) => {
      if (cancelled) return;
      // Worker の URL は相対パスだと Worker 側で解決できないため、絶対 URL にして渡す
      setWorkerUrl(new URL(WORKER_URL, window.location.href).href);
      const bounds = coordinates.reduce(
        (acc, coordinate) => acc.extend(coordinate),
        new LngLatBounds(coordinates[0], coordinates[0]),
      );
      const colors = ROUTE_COLORS[theme];

      map = new Map({
        container,
        style: STYLE_URLS[theme],
        bounds,
        fitBoundsOptions: { padding: 40, maxZoom: 16 },
        cooperativeGestures: true,
        dragRotate: false,
        touchPitch: false,
        attributionControl: { compact: true },
        locale,
      });

      const loadedMap = map;
      // OpenFreeMap の dark スタイルは sprite にない模様（wood-pattern）を参照していて警告が出るため、見つからない画像は透明な 1px の画像で埋める
      loadedMap.setMissingStyleImageResolver((id) => {
        if (!loadedMap.hasImage(id)) loadedMap.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
      });
      loadedMap.on("load", () => {
        collapseTimer = setTimeout(() => {
          container
            .querySelector(".maplibregl-ctrl-attrib.maplibregl-compact-show")
            ?.classList.remove("maplibregl-compact-show");
        }, ATTRIBUTION_COLLAPSE_MS);

        loadedMap.addSource("route", {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } },
        });
        loadedMap.addLayer({
          id: "route-casing",
          type: "line",
          source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": colors.casing, "line-width": 7 },
        });
        loadedMap.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": colors.line, "line-width": 4 },
        });

        loadedMap.addSource("endpoints", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [
              { type: "Feature", properties: { kind: "start" }, geometry: { type: "Point", coordinates: coordinates[0] } },
              {
                type: "Feature",
                properties: { kind: "end" },
                geometry: { type: "Point", coordinates: coordinates[coordinates.length - 1] },
              },
            ],
          },
        });
        loadedMap.addLayer({
          id: "endpoints",
          type: "circle",
          source: "endpoints",
          paint: {
            "circle-radius": 6,
            "circle-color": ["match", ["get", "kind"], "start", colors.casing, colors.line],
            "circle-stroke-color": colors.line,
            "circle-stroke-width": 3,
          },
        });
      });
    });

    return () => {
      cancelled = true;
      clearTimeout(collapseTimer);
      map?.remove();
    };
  }, [coordinates, theme, locale, online]);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-muted-foreground">{t("title")}</h2>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-border bg-muted">
        {coordinates.length === 0 ? (
          <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-muted-foreground">
            {t("noPoints")}
          </p>
        ) : !online ? (
          <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-muted-foreground">
            {t("offline")}
          </p>
        ) : (
          // MapLibre の CSS が地図の要素に position: relative を指定するため、absolute での配置に頼らず親の大きさに合わせる
          <div ref={containerRef} className="size-full" />
        )}
      </div>
    </section>
  );
}
