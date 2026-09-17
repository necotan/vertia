"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { Map as MapIcon, Maximize2, Minimize2 } from "lucide-react";
import type { FitBoundsOptions, LngLatBounds, Map as MapLibreMap } from "maplibre-gl";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { GpsPoint } from "@/lib/db/schema";
import { GPS_ACCURACY_LIMIT_M } from "@/lib/drive/liveStats";

const WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";
const ATTRIBUTION_COLLAPSE_MS = 5000;
const PLACEHOLDER_FADE_MS = 300;

const STYLE_URLS = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
} as const;

const ROUTE_COLORS = {
  light: { line: "#171717", casing: "#ffffff" },
  dark: { line: "#fafafa", casing: "#0a0a0a" },
} as const;

// 全画面表示を開いたときに積む履歴のエントリのキー
const FULLSCREEN_HISTORY_KEY = "vertiaSessionMapFullscreen";

function getFitBoundsOptions(fullscreen: boolean, button: HTMLElement | null): FitBoundsOptions {
  // 実際の位置から上の余白を決める
  const top = button ? button.offsetTop + button.offsetHeight + 16 : 96;
  return {
    padding: fullscreen ? { top, bottom: 64, left: 48, right: 48 } : 40,
    maxZoom: 16,
  };
}

type Coordinate = [number, number];
// loading: プレースホルダで地図を覆う, fading: プレースホルダをフェードアウト中, shown: 地図のみ
type Phase = "loading" | "fading" | "shown";

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
  // 地図のスタイルとタイルの読み込みが終わるまでは、帰属表示ボタンごとプレースホルダで覆う
  const [phase, setPhase] = useState<Phase>("loading");
  const [fullscreen, setFullscreen] = useState(false);
  const mapRef = useRef<MapLibreMap | null>(null);
  const boundsRef = useRef<LngLatBounds | null>(null);
  const fullscreenButtonRef = useRef<HTMLButtonElement>(null);
  // 全画面を開いたときに積んだ履歴のエントリが、まだ残っているか
  const historyEntryRef = useRef(false);

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

  // 地図を出せない状態になったら全画面も解除する
  const isFullscreen = fullscreen && coordinates.length > 0 && online;
  // テーマ切り替え等で地図を作り直すときに、全画面かどうかを引き継ぐ
  const isFullscreenRef = useRef(isFullscreen);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || coordinates.length === 0 || theme === undefined || !online) return;

    let map: MapLibreMap | null = null;
    let cancelled = false;
    let collapseTimer: ReturnType<typeof setTimeout> | undefined;

    void import("maplibre-gl").then(({ Map, LngLatBounds, setWorkerUrl, prewarm }) => {
      if (cancelled) return;
      // Worker の URL は相対パスだと Worker 側で解決できないため、絶対 URL にして渡す
      setWorkerUrl(new URL(WORKER_URL, window.location.href).href);
      // Worker を地図インスタンス間で使い回し、2回目以降の生成を最適化する
      prewarm();
      const bounds = coordinates.reduce(
        (acc, coordinate) => acc.extend(coordinate),
        new LngLatBounds(coordinates[0], coordinates[0]),
      );
      const colors = ROUTE_COLORS[theme];
      const fullscreenAtCreate = isFullscreenRef.current;

      map = new Map({
        container,
        style: STYLE_URLS[theme],
        bounds,
        fitBoundsOptions: getFitBoundsOptions(fullscreenAtCreate, fullscreenButtonRef.current),
        // 全画面では1本指で地図を動かせるようにする
        cooperativeGestures: !fullscreenAtCreate,
        dragRotate: false,
        touchPitch: false,
        attributionControl: { compact: true },
        locale,
      });

      const loadedMap = map;
      mapRef.current = loadedMap;
      boundsRef.current = bounds;
      // OpenFreeMap の dark スタイルは sprite にない模様（wood-pattern）を参照していて警告が出るため、見つからない画像は透明な 1px の画像で埋める
      loadedMap.setMissingStyleImageResolver((id) => {
        if (!loadedMap.hasImage(id)) loadedMap.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
      });
      loadedMap.on("load", () => {
        setPhase("fading");
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
      mapRef.current = null;
      boundsRef.current = null;
      map?.remove();
      setPhase("loading");
    };
  }, [coordinates, theme, locale, online]);

  useEffect(() => {
    isFullscreenRef.current = isFullscreen;
    const map = mapRef.current;
    const bounds = boundsRef.current;
    if (!map || !bounds) return;
    if (isFullscreen) map.cooperativeGestures.disable();
    else map.cooperativeGestures.enable();
    // 枠の大きさが変わった直後に合わせ直し、ルート全体が見える位置に戻す
    map.resize();
    map.fitBounds(bounds, { ...getFitBoundsOptions(isFullscreen, fullscreenButtonRef.current), animate: false });
  }, [isFullscreen]);

  const openFullscreen = () => {
    // 戻る操作やスワイプバックで全画面だけを閉じられるよう、同じ URL のエントリを積む
    window.history.pushState({ [FULLSCREEN_HISTORY_KEY]: true }, "");
    historyEntryRef.current = true;
    setFullscreen(true);
  };

  const closeFullscreen = useCallback(() => {
    // 積んだエントリは戻る操作で取り除き、popstate で全画面を解除する
    if (historyEntryRef.current) window.history.back();
    else setFullscreen(false);
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    const handlePopState = () => {
      historyEntryRef.current = false;
      setFullscreen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeFullscreen();
    };
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [fullscreen, closeFullscreen]);

  useEffect(() => {
    if (phase !== "fading") return;
    const timer = setTimeout(() => setPhase("shown"), PLACEHOLDER_FADE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-muted-foreground">{t("title")}</h2>
      {/* 全画面中も元の場所に同じ大きさの枠を残し、ページのスクロール位置がずれないようにする */}
      <div
        className={`aspect-[4/3] w-full rounded-2xl border border-border bg-muted ${isFullscreen ? "" : "relative overflow-hidden"}`}
      >
        {coordinates.length === 0 ? (
          <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-muted-foreground">
            {t("noPoints")}
          </p>
        ) : !online ? (
          <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-muted-foreground">
            {t("offline")}
          </p>
        ) : (
          // 全画面では relative の親を外し、画面全体の枠（AppShell）を基準に広げる（iOS のホーム画面アプリでは fixed がずれるため absolute を使用する）
          <div
            className={
              isFullscreen ? "session-map-fullscreen absolute inset-0 z-[60] bg-muted" : "absolute inset-0"
            }
          >
            {/* MapLibre の CSS が地図の要素に position: relative を指定するため、absolute での配置に頼らず親の大きさに合わせる */}
            <div ref={containerRef} className="size-full" />
            {phase !== "shown" && (
              <div
                aria-hidden
                className={`skeleton pointer-events-none absolute inset-0 z-10 flex items-center justify-center transition-opacity ${phase === "fading" ? "opacity-0" : ""}`}
                style={{ transitionDuration: `${PLACEHOLDER_FADE_MS}ms` }}
              >
                {/* シマーの ::after より手前に出すために relative にする */}
                <MapIcon className="relative size-10 text-muted-foreground" />
              </div>
            )}
            {(isFullscreen || phase === "shown") && (
              <button
                ref={fullscreenButtonRef}
                type="button"
                aria-label={isFullscreen ? t("exitFullscreen") : t("enterFullscreen")}
                onClick={isFullscreen ? closeFullscreen : openFullscreen}
                className={`absolute z-20 flex size-10 items-center justify-center rounded-full border border-border bg-background/90 text-foreground backdrop-blur-md transition-colors hover:bg-muted ${
                  isFullscreen
                    ?
                      "right-[calc(env(safe-area-inset-right)+20px)] top-[calc(env(safe-area-inset-top)+40px)]"
                    : "right-3 top-3"
                }`}
              >
                {isFullscreen ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
