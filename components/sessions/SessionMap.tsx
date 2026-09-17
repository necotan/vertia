"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { Layers, Map as MapIcon, Maximize2, Minimize2 } from "lucide-react";
import type {
  FitBoundsOptions,
  LngLatBounds,
  Map as MapLibreMap,
  TransformStyleFunction,
} from "maplibre-gl";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import type { GpsPoint } from "@/lib/db/schema";
import { GPS_ACCURACY_LIMIT_M } from "@/lib/drive/liveStats";
import { MAP_STYLES, type MapStyleId, saveMapStyle, themeMapStyle, useSavedMapStyle } from "@/lib/mapStyles";
import { MapStylePicker } from "./MapStylePicker";

const WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";
const ATTRIBUTION_COLLAPSE_MS = 5000;
const PLACEHOLDER_FADE_MS = 300;

const ROUTE_COLORS = {
  light: { line: "#171717", casing: "#ffffff" },
  dark: { line: "#fafafa", casing: "#0a0a0a" },
} as const;

// 全画面表示やスタイルの選択を開いたときに積む履歴のエントリのキー
const FULLSCREEN_HISTORY_KEY = "vertiaSessionMapFullscreen";
const STYLE_SHEET_HISTORY_KEY = "vertiaSessionMapStyleSheet";

function getFitBoundsOptions(fullscreen: boolean, button: HTMLElement | null, pitch: number): FitBoundsOptions {
  // 実際の位置から上の余白を決める
  const top = button ? button.offsetTop + button.offsetHeight + 16 : 96;
  return {
    padding: fullscreen ? { top, bottom: 64, left: 48, right: 48 } : 40,
    maxZoom: 16,
    pitch,
    bearing: 0,
  };
}

type Coordinate = [number, number];
type StyleSpecification = Parameters<TransformStyleFunction>[1];
type RouteStyle = Pick<StyleSpecification, "sources" | "layers">;

// ルートと始点・終点を描くためのソースとレイヤー
function buildRouteStyle(coordinates: Coordinate[], darkStyle: boolean): RouteStyle {
  const colors = ROUTE_COLORS[darkStyle ? "dark" : "light"];
  return {
    sources: {
      route: {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } },
      },
      endpoints: {
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
      },
    },
    layers: [
      {
        id: "route-casing",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": colors.casing, "line-width": 7 },
      },
      {
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": colors.line, "line-width": 4 },
      },
      {
        id: "endpoints",
        type: "circle",
        source: "endpoints",
        paint: {
          "circle-radius": 6,
          "circle-color": ["match", ["get", "kind"], "start", colors.casing, colors.line],
          "circle-stroke-color": colors.line,
          "circle-stroke-width": 3,
        },
      },
    ],
  };
}

// 立体表示のスタイルだけ、地図を傾けたり回したりできるようにする
function applyTiltGestures(map: MapLibreMap, pitch: number) {
  if (pitch > 0) {
    map.dragRotate.enable();
    map.touchPitch.enable();
  } else {
    map.dragRotate.disable();
    map.touchPitch.disable();
  }
}
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
  const [styleSheetOpen, setStyleSheetOpen] = useState(false);
  const savedStyle = useSavedMapStyle();
  const mapRef = useRef<MapLibreMap | null>(null);
  const boundsRef = useRef<LngLatBounds | null>(null);
  const fullscreenButtonRef = useRef<HTMLButtonElement>(null);
  // 全画面を開いたときに積んだ履歴のエントリが、まだ残っているか
  const historyEntryRef = useRef(false);
  const styleSheetEntryRef = useRef(false);

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
  // 選んだスタイルは全画面のときだけ使用し、小さい地図はテーマに合わせる
  const activeStyle: MapStyleId | undefined =
    theme === undefined ? undefined : isFullscreen ? (savedStyle ?? themeMapStyle(theme)) : themeMapStyle(theme);
  // テーマ切り替え等で地図を作り直すときに、全画面かどうかとスタイルを引き継ぐ
  const isFullscreenRef = useRef(isFullscreen);
  const activeStyleRef = useRef(activeStyle);
  // 地図に反映済みの状態
  const appliedFullscreenRef = useRef(isFullscreen);
  const appliedStyleRef = useRef<MapStyleId | null>(null);

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
      const fullscreenAtCreate = isFullscreenRef.current;
      const styleAtCreate = activeStyleRef.current ?? themeMapStyle(theme);
      const style = MAP_STYLES[styleAtCreate];

      map = new Map({
        container,
        style: style.url,
        bounds,
        fitBoundsOptions: getFitBoundsOptions(fullscreenAtCreate, fullscreenButtonRef.current, style.pitch),
        pitch: style.pitch,
        // 全画面では1本指で地図を動かせるようにする
        cooperativeGestures: !fullscreenAtCreate,
        dragRotate: style.pitch > 0,
        touchPitch: style.pitch > 0,
        attributionControl: { compact: true },
        locale,
      });

      const loadedMap = map;
      mapRef.current = loadedMap;
      boundsRef.current = bounds;
      appliedFullscreenRef.current = fullscreenAtCreate;
      appliedStyleRef.current = styleAtCreate;
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

        // 読み込み前にスタイルを切り替えた場合は、切り替え時にルートを追加済み
        if (loadedMap.getSource("route")) return;
        const route = buildRouteStyle(coordinates, style.dark);
        for (const [id, source] of Object.entries(route.sources)) loadedMap.addSource(id, source);
        for (const layer of route.layers) loadedMap.addLayer(layer);
      });
    });

    return () => {
      cancelled = true;
      clearTimeout(collapseTimer);
      mapRef.current = null;
      boundsRef.current = null;
      appliedStyleRef.current = null;
      map?.remove();
      setPhase("loading");
    };
  }, [coordinates, theme, locale, online]);

  useEffect(() => {
    isFullscreenRef.current = isFullscreen;
    activeStyleRef.current = activeStyle;
    const map = mapRef.current;
    const bounds = boundsRef.current;
    const previousStyle = appliedStyleRef.current;
    if (!map || !bounds || activeStyle === undefined || previousStyle === null) return;
    const fullscreenChanged = appliedFullscreenRef.current !== isFullscreen;
    const styleChanged = previousStyle !== activeStyle;
    if (!fullscreenChanged && !styleChanged) return;
    appliedFullscreenRef.current = isFullscreen;
    appliedStyleRef.current = activeStyle;
    const style = MAP_STYLES[activeStyle];

    // 3D は Liberty を傾けて表示するだけなので、同じ URL のときは読み込み直さない
    if (MAP_STYLES[previousStyle].url !== style.url) {
      const route = buildRouteStyle(coordinates, style.dark);
      // 新しいスタイルにルートを加えてから反映し、切り替え中にルートが消えないようにする
      map.setStyle(style.url, {
        transformStyle: (_previous, next) => ({
          ...next,
          sources: { ...next.sources, ...route.sources },
          layers: [...next.layers, ...route.layers],
        }),
      });
    }
    if (fullscreenChanged) {
      if (isFullscreen) map.cooperativeGestures.disable();
      else map.cooperativeGestures.enable();
    }
    applyTiltGestures(map, style.pitch);

    if (fullscreenChanged) {
      map.resize();
      map.fitBounds(bounds, {
        ...getFitBoundsOptions(isFullscreen, fullscreenButtonRef.current, style.pitch),
        animate: false,
      });
    } else if (MAP_STYLES[previousStyle].pitch !== style.pitch) {
      map.easeTo({ pitch: style.pitch, bearing: 0 });
    }
  }, [isFullscreen, activeStyle, coordinates]);

  const openFullscreen = () => {
    // 戻る操作やスワイプバックで全画面だけを閉じられるよう、同じ URL のエントリを積む
    window.history.pushState({ [FULLSCREEN_HISTORY_KEY]: true }, "");
    historyEntryRef.current = true;
    setFullscreen(true);
  };

  const closeFullscreen = useCallback(() => {
    // 積んだエントリは戻る操作で取り除き、popstate で全画面を解除する
    if (historyEntryRef.current) {
      // スタイルの選択を開いている場合は、そのエントリもまとめて取り除く
      const steps = styleSheetEntryRef.current ? 2 : 1;
      styleSheetEntryRef.current = false;
      window.history.go(-steps);
    } else {
      setFullscreen(false);
      setStyleSheetOpen(false);
    }
  }, []);

  const openStyleSheet = () => {
    // 戻る操作ではスタイルの選択だけを閉じられるよう、もう1つエントリを積む
    window.history.pushState({ [FULLSCREEN_HISTORY_KEY]: true, [STYLE_SHEET_HISTORY_KEY]: true }, "");
    styleSheetEntryRef.current = true;
    setStyleSheetOpen(true);
  };

  const closeStyleSheet = useCallback(() => {
    if (styleSheetEntryRef.current) window.history.back();
    else setStyleSheetOpen(false);
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    const handlePopState = () => {
      if (styleSheetEntryRef.current) {
        styleSheetEntryRef.current = false;
        setStyleSheetOpen(false);
        return;
      }
      historyEntryRef.current = false;
      setFullscreen(false);
      setStyleSheetOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (styleSheetOpen) closeStyleSheet();
      else closeFullscreen();
    };
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [fullscreen, styleSheetOpen, closeFullscreen, closeStyleSheet]);

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
            {isFullscreen && phase === "shown" && activeStyle !== undefined && (
              <>
                <button
                  type="button"
                  aria-label={t("styles.open")}
                  aria-expanded={styleSheetOpen}
                  onClick={openStyleSheet}
                  className="absolute right-[calc(env(safe-area-inset-right)+20px)] top-[calc(env(safe-area-inset-top)+92px)] z-20 flex size-10 items-center justify-center rounded-full border border-border bg-background/90 text-foreground backdrop-blur-md transition-colors hover:bg-muted"
                >
                  <Layers className="size-5" />
                </button>
                <BottomSheet
                  open={styleSheetOpen}
                  title={t("styles.title")}
                  closeLabel={t("styles.close")}
                  onClose={closeStyleSheet}
                >
                  <MapStylePicker value={activeStyle} onChange={saveMapStyle} />
                </BottomSheet>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
