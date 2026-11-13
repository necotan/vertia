"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { Gauge, Layers, Map as MapIcon, Maximize2, Minimize2 } from "lucide-react";
import type {
  JumpToOptions,
  LngLatBounds,
  Map as MapLibreMap,
  TransformStyleFunction,
} from "maplibre-gl";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import type { GpsPoint } from "@/lib/db/schema";
import { GPS_ACCURACY_LIMIT_M } from "@/lib/drive/liveStats";
import {
  collapseAttribution,
  fillMissingStyleImages,
  loadMapLibre,
  setupAttribution,
  useMapPageBackground,
  useOnline,
} from "@/lib/mapLibre";
import { MAP_STYLES, type MapStyleId, saveMapStyle, themeMapStyle, useSavedMapStyle } from "@/lib/mapStyles";
import { saveRouteSpeedColors, useRouteSpeedColors, useSpeedPalette, useSpeedScale } from "@/lib/routeColorMode";
import { buildSpeedGradient, SPEED_PALETTES, type SpeedGradient } from "@/lib/routeSpeed";
import { useDistanceUnit } from "@/lib/units";
import { MapStylePicker } from "./MapStylePicker";
import { RouteSpeedLegend } from "./RouteSpeedLegend";

const ATTRIBUTION_COLLAPSE_MS = 5000;
const PLACEHOLDER_FADE_MS = 300;

const ROUTE_COLORS = {
  light: { line: "#171717", casing: "#ffffff" },
  dark: { line: "#fafafa", casing: "#0a0a0a" },
} as const;

// 点の半径と枠線の幅（endpoints レイヤー）に、ラベルとの隙間を足した距離
const ENDPOINT_LABEL_OFFSET_PX = 14;
// ラベルは点を中心に左右へ広がり、上下には点からこの距離まで伸びる
const ENDPOINT_LABEL_HALF_WIDTH_PX = 24;
const ENDPOINT_LABEL_EXTENT_PX = ENDPOINT_LABEL_OFFSET_PX + 22;
const FIT_EDGE_GAP_PX = 12;
const ROUTE_LINE_WIDTH_PX = 5;
const ROUTE_CASING_WIDTH_PX = 8;
const ROUTE_CASING_HALF_WIDTH_PX = ROUTE_CASING_WIDTH_PX / 2;
// 塗りつぶしの開始点と二重丸の終了点に合わせ、ラベルも塗りつぶしと枠線だけにする
const ENDPOINT_LABEL_BASE_CLASS =
  "pointer-events-none whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-4 backdrop-blur-md";
const ENDPOINT_LABEL_CLASS = {
  start: `${ENDPOINT_LABEL_BASE_CLASS} border-foreground bg-foreground/90 text-background`,
  end: `${ENDPOINT_LABEL_BASE_CLASS} border-foreground bg-background/90 text-foreground`,
} as const;

const FULLSCREEN_HISTORY_KEY = "vertiaSessionMapFullscreen";
const STYLE_SHEET_HISTORY_KEY = "vertiaSessionMapStyleSheet";

type Padding = { top: number; bottom: number; left: number; right: number };
type FitOptions = { padding: Padding; maxZoom: number; pitch: number; bearing: number };

function getFitBoundsOptions(fullscreen: boolean, button: HTMLElement | null, pitch: number): FitOptions {
  const top = button ? button.offsetTop + button.offsetHeight + 16 : 96;
  // 右上のボタンは縦に並ぶため、ルートと開始・終了のラベルをボタンの列より左に収める
  const buttonColumnWidth = button?.offsetParent ? button.offsetParent.clientWidth - button.offsetLeft : 0;
  const right = buttonColumnWidth + ENDPOINT_LABEL_HALF_WIDTH_PX + FIT_EDGE_GAP_PX;
  return {
    padding: fullscreen
      ? { top, bottom: 64, left: 48, right: Math.max(right, 48) }
      : {
          top: 72,
          bottom: ENDPOINT_LABEL_EXTENT_PX + FIT_EDGE_GAP_PX,
          left: 40,
          right: Math.max(right, 40),
        },
    maxZoom: 16,
    pitch,
    bearing: 0,
  };
}

type Rect = { left: number; top: number; right: number; bottom: number };

function intersects(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

// 凡例と地図はどちらも同じ枠いっぱいに置かれているため、offset の座標をそのまま地図の画面座標として扱える
function elementRect(element: HTMLElement): Rect {
  return {
    left: element.offsetLeft,
    top: element.offsetTop,
    right: element.offsetLeft + element.offsetWidth,
    bottom: element.offsetTop + element.offsetHeight,
  };
}

function routeOverlaps(map: MapLibreMap, coordinates: Coordinate[], area: Rect): boolean {
  const lineArea = {
    left: area.left - ROUTE_CASING_HALF_WIDTH_PX,
    top: area.top - ROUTE_CASING_HALF_WIDTH_PX,
    right: area.right + ROUTE_CASING_HALF_WIDTH_PX,
    bottom: area.bottom + ROUTE_CASING_HALF_WIDTH_PX,
  };
  const lineOverlaps = coordinates.some((coordinate) => {
    const { x, y } = map.project(coordinate);
    return x > lineArea.left && x < lineArea.right && y > lineArea.top && y < lineArea.bottom;
  });
  if (lineOverlaps) return true;
  const start = map.project(coordinates[0]);
  const end = map.project(coordinates[coordinates.length - 1]);
  const startLabel = {
    left: start.x - ENDPOINT_LABEL_HALF_WIDTH_PX,
    top: start.y - ENDPOINT_LABEL_EXTENT_PX,
    right: start.x + ENDPOINT_LABEL_HALF_WIDTH_PX,
    bottom: start.y,
  };
  const endLabel = {
    left: end.x - ENDPOINT_LABEL_HALF_WIDTH_PX,
    top: end.y,
    right: end.x + ENDPOINT_LABEL_HALF_WIDTH_PX,
    bottom: end.y + ENDPOINT_LABEL_EXTENT_PX,
  };
  return intersects(startLabel, area) || intersects(endLabel, area);
}

// 凡例に重なるときだけ、凡例の下か右にルートを収める
// 小さくしすぎないよう、大きく表示できる方を選ぶ
function routeCamera(
  map: MapLibreMap,
  bounds: LngLatBounds,
  coordinates: Coordinate[],
  options: FitOptions,
  legend: HTMLElement | null,
): JumpToOptions | undefined {
  const cameraFor = (padding: Padding) => {
    const camera = map.cameraForBounds(bounds, { ...options, padding });
    return camera && { ...camera, pitch: options.pitch };
  };
  const base = cameraFor(options.padding);
  if (!base || !legend) return base;

  const legendRect = elementRect(legend);
  // map.project は現在のカメラで計算するため、一度動かして判定し、描画される前に元へ戻す
  const current = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
  map.jumpTo(base);
  const overlaps = routeOverlaps(map, coordinates, legendRect);
  map.jumpTo(current);
  if (!overlaps) return base;

  const { padding } = options;
  const below = cameraFor({
    ...padding,
    top: Math.max(padding.top, legendRect.bottom + ENDPOINT_LABEL_EXTENT_PX + FIT_EDGE_GAP_PX),
  });
  const beside = cameraFor({
    ...padding,
    left: Math.max(padding.left, legendRect.right + ENDPOINT_LABEL_HALF_WIDTH_PX + FIT_EDGE_GAP_PX),
  });
  if (!below || !beside) return below ?? beside ?? base;
  return (below.zoom ?? 0) >= (beside.zoom ?? 0) ? below : beside;
}

type Coordinate = [number, number];
type StyleSpecification = Parameters<TransformStyleFunction>[1];
type RouteStyle = Pick<StyleSpecification, "sources" | "layers">;
type LayerSpec = StyleSpecification["layers"][number];
type Visibility = "visible" | "none";

type RouteData = {
  coordinates: Coordinate[];
  speedGradient: SpeedGradient;
  speedColors: boolean;
};

function routeVisibility(speedColors: boolean): { line: Visibility; speed: Visibility } {
  return speedColors ? { line: "none", speed: "visible" } : { line: "visible", speed: "none" };
}

function buildRouteStyle({ coordinates, speedGradient, speedColors }: RouteData, darkStyle: boolean): RouteStyle {
  const colors = ROUTE_COLORS[darkStyle ? "dark" : "light"];
  const visibility = routeVisibility(speedColors);
  return {
    sources: {
      route: {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } },
        // 速度の色を line-gradient で付けるため、線の始点からの割合を使えるようにする
        lineMetrics: true,
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
        paint: { "line-color": colors.casing, "line-width": ROUTE_CASING_WIDTH_PX },
      },
      {
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "round", visibility: visibility.line },
        paint: { "line-color": colors.line, "line-width": ROUTE_LINE_WIDTH_PX },
      },
      {
        id: "route-speed-line",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "round", visibility: visibility.speed },
        paint: { "line-gradient": speedGradient, "line-width": ROUTE_LINE_WIDTH_PX },
      },
      {
        id: "endpoints",
        type: "circle",
        source: "endpoints",
        paint: {
          "circle-radius": 6,
          "circle-color": ["match", ["get", "kind"], "start", colors.line, colors.casing],
          "circle-stroke-color": colors.line,
          "circle-stroke-width": 3,
        },
      },
      // circle レイヤーは1つの円しか描けないため、終了点の二重丸の中心は別のレイヤーで重ねる
      {
        id: "endpoints-end-center",
        type: "circle",
        source: "endpoints",
        filter: ["==", ["get", "kind"], "end"],
        paint: { "circle-radius": 3, "circle-color": colors.line },
      },
    ],
  };
}

// 地名を線で隠さないよう、線は symbol 以外の最後のレイヤーのすぐ上に入れる
// dark などは水域名や道路名の symbol が道路より前にあり、最初の symbol の下では線が道路や境界線に隠れる
// 開始・終了の点は文字に隠れないよう一番上に置く
function routeLayerBeforeId(layer: LayerSpec, styleLayers: LayerSpec[]): string | undefined {
  if (layer.type !== "line") return undefined;
  const lastIndex = styleLayers.findLastIndex((styleLayer) => styleLayer.type !== "symbol");
  return styleLayers[lastIndex + 1]?.id;
}

function insertRouteLayers(styleLayers: LayerSpec[], routeLayers: LayerSpec[]): LayerSpec[] {
  const layers = [...styleLayers];
  for (const layer of routeLayers) {
    const beforeId = routeLayerBeforeId(layer, styleLayers);
    const index = beforeId === undefined ? -1 : layers.findIndex((styleLayer) => styleLayer.id === beforeId);
    if (index === -1) layers.push(layer);
    else layers.splice(index, 0, layer);
  }
  return layers;
}

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

export function SessionMap({ points }: { points: GpsPoint[] }) {
  const t = useTranslations("sessions.detail.map");
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const online = useOnline();
  // 地図のスタイルとタイルの読み込みが終わるまでは、帰属表示ボタンごとプレースホルダで覆う
  const [phase, setPhase] = useState<Phase>("loading");
  const [fullscreen, setFullscreen] = useState(false);
  const [styleSheetOpen, setStyleSheetOpen] = useState(false);
  const savedStyle = useSavedMapStyle();
  const speedColors = useRouteSpeedColors();
  const speedPalette = useSpeedPalette();
  const speedScale = useSpeedScale();
  const unit = useDistanceUnit();
  const mapRef = useRef<MapLibreMap | null>(null);
  const boundsRef = useRef<LngLatBounds | null>(null);
  const fullscreenButtonRef = useRef<HTMLButtonElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  // 利用者が地図を動かした後は、凡例の表示を切り替えても表示範囲を変えない
  const userMovedRef = useRef(false);
  // 全画面を開いたときに積んだ履歴のエントリが、まだ残っているか
  const historyEntryRef = useRef(false);
  const styleSheetEntryRef = useRef(false);

  const coordinates = useMemo<Coordinate[]>(
    () => points.filter((p) => p.accuracy <= GPS_ACCURACY_LIMIT_M).map((p) => [p.lng, p.lat]),
    [points],
  );
  const speedRoute = useMemo(
    () => buildSpeedGradient(points, unit, SPEED_PALETTES[speedPalette], speedScale),
    [points, unit, speedPalette, speedScale],
  );
  const speedGradient = speedRoute.gradient;
  // 地図を作り直さずに切り替えるため、ルートの描画ではその時点の値を参照する
  const speedGradientRef = useRef(speedGradient);
  const speedColorsRef = useRef(speedColors);
  const getRouteStyle = useCallback(
    (darkStyle: boolean) =>
      buildRouteStyle(
        { coordinates, speedGradient: speedGradientRef.current, speedColors: speedColorsRef.current },
        darkStyle,
      ),
    [coordinates],
  );
  const fitRoute = useCallback(
    (map: MapLibreMap, bounds: LngLatBounds, fullscreen: boolean, pitch: number, animate: boolean) => {
      const options = getFitBoundsOptions(fullscreen, fullscreenButtonRef.current, pitch);
      const camera = routeCamera(map, bounds, coordinates, options, legendRef.current);
      if (!camera) return;
      userMovedRef.current = false;
      if (animate) map.easeTo(camera);
      else map.jumpTo(camera);
    },
    [coordinates],
  );

  const locale = useMemo<Record<string, string>>(
    () => ({
      "CooperativeGesturesHandler.MobileHelpText": t("gestureMobile"),
      "CooperativeGesturesHandler.WindowsHelpText": t("gestureWindows"),
      "CooperativeGesturesHandler.MacHelpText": t("gestureMac"),
    }),
    [t],
  );
  const endpointLabelText = useMemo(() => ({ start: t("endpoints.start"), end: t("endpoints.end") }), [t]);

  // next-themes はマウント前に undefined を返すため、テーマが決まってから地図を描画する
  const theme = resolvedTheme === undefined ? undefined : resolvedTheme === "dark" ? "dark" : "light";

  const isFullscreen = fullscreen && coordinates.length > 0 && online;
  // 選んだスタイルは全画面のときだけ使用し、小さい地図はテーマに合わせる
  const activeStyle: MapStyleId | undefined =
    theme === undefined ? undefined : isFullscreen ? (savedStyle ?? themeMapStyle(theme)) : themeMapStyle(theme);
  const mapPalette = activeStyle === undefined ? "" : MAP_STYLES[activeStyle].dark ? "dark" : "light";
  // テーマ切り替え等で地図を作り直すときに、全画面かどうかとスタイルを引き継ぐ
  const isFullscreenRef = useRef(isFullscreen);
  const activeStyleRef = useRef(activeStyle);
  const appliedFullscreenRef = useRef(isFullscreen);
  const appliedStyleRef = useRef<MapStyleId | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || coordinates.length === 0 || theme === undefined || !online) return;

    let map: MapLibreMap | null = null;
    let cancelled = false;
    let collapseTimer: ReturnType<typeof setTimeout> | undefined;
    const teardownAttribution = setupAttribution(container);

    void loadMapLibre().then(({ Map, LngLatBounds, Marker }) => {
      if (cancelled) return;
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
      // 描画は次のフレームからなので、作成直後に動かしても初期位置は見えない
      fitRoute(loadedMap, bounds, fullscreenAtCreate, style.pitch, false);
      loadedMap.on("movestart", (event) => {
        if (event.originalEvent) userMovedRef.current = true;
      });
      fillMissingStyleImages(loadedMap);

      // スタイルのフォントには日本語のグリフがない場合があるため、symbol レイヤーではなく DOM のマーカーで文字を出す
      // 開始と終了が重なる周回ルートでも両方読めるよう、開始は点の上、終了は下に置く
      // 左右に置くと地図の端や右上のボタンに隠れやすいため、はみ出しの小さい上下にする
      const endpointLabels = [
        { kind: "start", coordinate: coordinates[0], anchor: "bottom", offsetY: -ENDPOINT_LABEL_OFFSET_PX },
        { kind: "end", coordinate: coordinates[coordinates.length - 1], anchor: "top", offsetY: ENDPOINT_LABEL_OFFSET_PX },
      ] as const;
      for (const { kind, coordinate, anchor, offsetY } of endpointLabels) {
        const element = document.createElement("span");
        element.className = ENDPOINT_LABEL_CLASS[kind];
        element.textContent = endpointLabelText[kind];
        new Marker({ element, anchor, offset: [0, offsetY] }).setLngLat(coordinate).addTo(loadedMap);
      }

      loadedMap.on("load", () => {
        setPhase("fading");
        collapseTimer = setTimeout(() => collapseAttribution(container), ATTRIBUTION_COLLAPSE_MS);

        // 読み込み前にスタイルを切り替えた場合は、切り替え時にルートを追加済み
        if (loadedMap.getSource("route")) return;
        const route = getRouteStyle(style.dark);
        for (const [id, source] of Object.entries(route.sources)) loadedMap.addSource(id, source);
        const styleLayers = loadedMap.getStyle().layers;
        for (const layer of route.layers) loadedMap.addLayer(layer, routeLayerBeforeId(layer, styleLayers));
      });
    });

    return () => {
      cancelled = true;
      clearTimeout(collapseTimer);
      teardownAttribution();
      mapRef.current = null;
      boundsRef.current = null;
      appliedStyleRef.current = null;
      map?.remove();
      setPhase("loading");
    };
  }, [coordinates, theme, locale, endpointLabelText, online, getRouteStyle, fitRoute]);

  useEffect(() => {
    speedGradientRef.current = speedGradient;
    speedColorsRef.current = speedColors;
    const map = mapRef.current;
    if (!map) return;
    // 読み込み前やスタイルの切り替え中は、ルートを追加するときに最新の値が反映される
    if (!map.getLayer("route-line") || !map.getLayer("route-speed-line")) return;
    map.setPaintProperty("route-speed-line", "line-gradient", speedGradient);
    const visibility = routeVisibility(speedColors);
    map.setLayoutProperty("route-line", "visibility", visibility.line);
    map.setLayoutProperty("route-speed-line", "visibility", visibility.speed);
  }, [speedGradient, speedColors]);

  useEffect(() => {
    const map = mapRef.current;
    const bounds = boundsRef.current;
    const style = appliedStyleRef.current;
    if (!map || !bounds || style === null || userMovedRef.current) return;
    fitRoute(map, bounds, appliedFullscreenRef.current, MAP_STYLES[style].pitch, true);
  }, [speedColors, fitRoute]);

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
      // 新しいスタイルにルートを加えてから反映し、切り替え中にルートが消えないようにする
      map.setStyle(style.url, {
        transformStyle: (_previous, next) => {
          const route = getRouteStyle(style.dark);
          return {
            ...next,
            sources: { ...next.sources, ...route.sources },
            layers: insertRouteLayers(next.layers, route.layers),
          };
        },
      });
    }
    if (fullscreenChanged) {
      if (isFullscreen) map.cooperativeGestures.disable();
      else map.cooperativeGestures.enable();
    }
    applyTiltGestures(map, style.pitch);

    if (fullscreenChanged) {
      map.resize();
      fitRoute(map, bounds, isFullscreen, style.pitch, false);
    } else if (MAP_STYLES[previousStyle].pitch !== style.pitch) {
      map.easeTo({ pitch: style.pitch, bearing: 0 });
    }
  }, [isFullscreen, activeStyle, getRouteStyle, fitRoute]);

  useMapPageBackground(isFullscreen && activeStyle !== undefined ? MAP_STYLES[activeStyle].swatch.background : null);

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

  // プレースホルダが消え終わるのを待つと地図だけ先に見える時間ができるため、フェードの開始と同時に操作を出す
  const controlsVisible = phase !== "loading";

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
            className={`${mapPalette} ${
              isFullscreen ? "session-map-fullscreen absolute inset-0 z-[60] bg-muted" : "absolute inset-0"
            }`}
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
            <div
              inert={!isFullscreen && !controlsVisible}
              className={`pointer-events-none absolute inset-0 z-20 transition-opacity ${
                isFullscreen || controlsVisible ? "" : "opacity-0"
              }`}
              style={{ transitionDuration: `${PLACEHOLDER_FADE_MS}ms` }}
            >
              <button
                ref={fullscreenButtonRef}
                type="button"
                aria-label={isFullscreen ? t("exitFullscreen") : t("enterFullscreen")}
                onClick={isFullscreen ? closeFullscreen : openFullscreen}
                className={`pointer-events-auto absolute flex size-10 items-center justify-center rounded-full border border-border bg-background/90 text-foreground backdrop-blur-md transition-colors hover:bg-muted ${
                  isFullscreen
                    ?
                      "right-[calc(env(safe-area-inset-right)+20px)] top-[calc(env(safe-area-inset-top)+40px)]"
                    : "right-3 top-3"
                }`}
              >
                {isFullscreen ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}
              </button>
            </div>
            <div
              inert={!controlsVisible}
              className={`pointer-events-none absolute inset-0 z-20 transition-opacity ${controlsVisible ? "" : "opacity-0"}`}
              style={{ transitionDuration: `${PLACEHOLDER_FADE_MS}ms` }}
            >
              <button
                type="button"
                aria-label={t("speedColors.toggle")}
                aria-pressed={speedColors}
                onClick={() => saveRouteSpeedColors(!speedColors)}
                className={`pointer-events-auto absolute flex size-10 items-center justify-center rounded-full border backdrop-blur-md transition-colors ${
                  speedColors
                    ?
                      "border-background bg-foreground/90 text-background hover:bg-foreground/80"
                    : "border-border bg-background/90 text-foreground hover:bg-muted"
                } ${
                  isFullscreen
                    ? "right-[calc(env(safe-area-inset-right)+20px)] top-[calc(env(safe-area-inset-top)+144px)]"
                    : "right-3 top-[3.75rem]"
                }`}
              >
                <Gauge className="size-5" />
              </button>
              {speedColors && (
                <RouteSpeedLegend
                  ref={legendRef}
                  thresholds={speedRoute.thresholds}
                  className={`absolute ${
                    isFullscreen
                      ? "left-[calc(env(safe-area-inset-left)+20px)] top-[calc(env(safe-area-inset-top)+40px)]"
                      : "left-3 top-3"
                  }`}
                />
              )}
              {isFullscreen && activeStyle !== undefined && (
                <button
                  type="button"
                  aria-label={t("styles.open")}
                  aria-expanded={styleSheetOpen}
                  onClick={openStyleSheet}
                  className="pointer-events-auto absolute right-[calc(env(safe-area-inset-right)+20px)] top-[calc(env(safe-area-inset-top)+92px)] flex size-10 items-center justify-center rounded-full border border-border bg-background/90 text-foreground backdrop-blur-md transition-colors hover:bg-muted"
                >
                  <Layers className="size-5" />
                </button>
              )}
            </div>
            {isFullscreen && activeStyle !== undefined && (
              <BottomSheet
                open={styleSheetOpen}
                title={t("styles.title")}
                closeLabel={t("styles.close")}
                onClose={closeStyleSheet}
              >
                <MapStylePicker value={activeStyle} onChange={saveMapStyle} />
              </BottomSheet>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
