"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, Layers } from "lucide-react";
import type {
  GeoJSONSource,
  MapSourceDataEvent,
  Map as MapLibreMap,
  Marker,
  TransformStyleFunction,
} from "maplibre-gl";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SessionsEmptyState } from "@/components/sessions/SessionsEmptyState";
import { MapStylePicker } from "@/components/sessions/MapStylePicker";
import { BackLink } from "@/components/ui/BackLink";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { db, type DriveSession, type SessionCells } from "@/lib/db/schema";
import { recoverInterruptedSessions } from "@/lib/db/sessionRepository";
import {
  cacheSessionCells,
  cellsToCoordinates,
  coordinatesBounds,
  hasCellTarget,
  isCurrentSessionCells,
  type MultiPolygonCoordinates,
  toCoarseCells,
} from "@/lib/exploredCells";
import { detectExploredMapView, type ExploredMapView, saveExploredMapView } from "@/lib/exploredMapView";
import { fillMissingStyleImages, loadMapLibre, useMapPageBackground, useOnline } from "@/lib/mapLibre";
import { MAP_STYLES, type MapStyleId, saveMapStyle, themeMapStyle, useSavedMapStyle } from "@/lib/mapStyles";
import {
  type Bounds,
  countCellsInRegion,
  findRegionAt,
  type Region,
  type RegionLevel,
  regionPartBoundsAt,
  toCellCenters,
} from "@/lib/regions";

const ATTRIBUTION_COLLAPSE_MS = 5000;
const LOADING_FADE_MS = 400;
const LOADING_HOLD_MS = 200;
const MAP_PROGRESS_WEIGHTS = { script: 0.1, style: 0.2, tiles: 0.7 } as const;
const FINE_MIN_ZOOM = 9;
// これより縮小すると、中央の都道府県を示しても周りの県と見分けにくい
const PREFECTURE_MIN_ZOOM = 6;
const FIT_MAX_ZOOM = 13;

const EXPLORED_COLORS = {
  light: { fill: "#4f5bd5", line: "#3b45b8" },
  dark: { fill: "#8f86f5", line: "#b3adf9" },
} as const;

const STYLE_SHEET_HISTORY_KEY = "vertiaExploredMapStyleSheet";

const MAP_BUTTON_CLASS =
  "pointer-events-auto absolute top-[calc(env(safe-area-inset-top)+40px)] flex size-10 items-center justify-center rounded-full border border-border bg-background/90 text-foreground backdrop-blur-md transition-colors hover:bg-muted";

type StyleSpecification = Parameters<TransformStyleFunction>[1];
type LayerSpecification = StyleSpecification["layers"][number];
type ExploredStyle = Pick<StyleSpecification, "sources" | "layers">;
type ExploredShapes = { fine: MultiPolygonCoordinates; coarse: MultiPolygonCoordinates };
type ExploredData = { sessions: DriveSession[]; cells: SessionCells[] };
type RegionBadge = { element: HTMLDivElement; marker: Marker };

const LEVELS = ["coarse", "fine"] as const;
const REGION_SOURCE = "region";

function toFeature(coordinates: MultiPolygonCoordinates) {
  return { type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates } } as const;
}

function buildExploredStyle(
  shapes: ExploredShapes,
  regionCoordinates: MultiPolygonCoordinates,
  darkStyle: boolean,
): ExploredStyle {
  const colors = EXPLORED_COLORS[darkStyle ? "dark" : "light"];
  const sources: ExploredStyle["sources"] = {};
  const layers: ExploredStyle["layers"] = [];
  for (const level of LEVELS) {
    const source = `explored-${level}`;
    const zoom = level === "coarse" ? { maxzoom: FINE_MIN_ZOOM } : { minzoom: FINE_MIN_ZOOM };
    sources[source] = { type: "geojson", data: toFeature(shapes[level]) };
    layers.push(
      { id: `${source}-fill`, type: "fill", source, ...zoom, paint: { "fill-color": colors.fill, "fill-opacity": 0.35 } },
      {
        id: `${source}-line`,
        type: "line",
        source,
        ...zoom,
        layout: { "line-join": "round" },
        paint: { "line-color": colors.line, "line-width": 1.5 },
      },
    );
  }
  sources[REGION_SOURCE] = { type: "geojson", data: toFeature(regionCoordinates) };
  layers.push({
    id: `${REGION_SOURCE}-line`,
    type: "line",
    source: REGION_SOURCE,
    layout: { "line-join": "round" },
    paint: { "line-color": colors.line, "line-width": 3 },
  });
  return { sources, layers };
}

// スタイルによっては途中にも文字のレイヤーがあるため、最後の文字以外のレイヤーの直後を探す
function labelLayersStart(layers: LayerSpecification[]): number {
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    if (layers[index].type !== "symbol") return index + 1;
  }
  return 0;
}

// 走った範囲だけに合わせると近づきすぎるため、その県が収まる範囲にする
async function withPrefectureBounds(latest: Bounds, latestCells: string[]): Promise<Bounds> {
  const [west, south, east, north] = latest;
  // 範囲の中心が海の上のときは、走った地点で探す
  const points = [{ lng: (west + east) / 2, lat: (south + north) / 2 }, ...toCellCenters(latestCells.slice(0, 1))];
  for (const point of points) {
    // 境界を読み込めなかったときは、走った範囲だけに合わせる
    const prefecture = await findRegionAt("prefecture", point).catch(() => null);
    const part = prefecture && regionPartBoundsAt(prefecture, point);
    if (part) {
      return [Math.min(west, part[0]), Math.min(south, part[1]), Math.max(east, part[2]), Math.max(north, part[3])];
    }
  }
  return latest;
}

function regionLevelAt(zoom: number): RegionLevel | null {
  if (zoom >= FINE_MIN_ZOOM) return "municipality";
  return zoom >= PREFECTURE_MIN_ZOOM ? "prefecture" : null;
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

type Phase = "loading" | "fading" | "shown";

export function ExploredMapScreen() {
  const t = useTranslations("map");
  const tCommon = useTranslations("common");
  const tUnits = useTranslations("units");
  const format = useFormatter();
  const locale = useLocale();
  const { resolvedTheme } = useTheme();
  const online = useOnline();
  const savedStyle = useSavedMapStyle();
  const containerRef = useRef<HTMLDivElement>(null);
  const backLinkRef = useRef<HTMLAnchorElement>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [mapProgress, setMapProgress] = useState(0);
  const [progressFloor, setProgressFloor] = useState(0);
  const [pendingTotal, setPendingTotal] = useState(0);
  const stopProgressRef = useRef<(() => void) | null>(null);
  const loadingLabelId = useId();
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [regionBadge, setRegionBadge] = useState<RegionBadge | null>(null);
  const [styleSheetOpen, setStyleSheetOpen] = useState(false);
  const styleSheetEntryRef = useRef(false);
  // 失敗したセッションを外さないと、次のセッションに進めなくなる
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(() => new Set());

  const data = useLiveQuery<ExploredData>(async () => {
    const [sessions, cells] = await Promise.all([db.sessions.toArray(), db.sessionCells.toArray()]);
    return { sessions, cells };
  }, []);

  useEffect(() => {
    void recoverInterruptedSessions();
  }, []);

  const explored = useMemo(() => {
    if (!data) return null;
    const targets = data.sessions.filter(hasCellTarget);
    const cached = new Map(data.cells.filter(isCurrentSessionCells).map((row) => [row.sessionId, row.cells]));
    const pending = targets.filter((s) => !cached.has(s.id) && !failedIds.has(s.id)).map((s) => s.id);
    const cells = new Set<string>();
    for (const session of targets) for (const cell of cached.get(session.id) ?? []) cells.add(cell);
    // 全セルに合わせると、各地を走っていると日本全体まで縮小されるため、最後に走った場所を見せる
    let latest: DriveSession | null = null;
    for (const session of targets) {
      if ((cached.get(session.id)?.length ?? 0) === 0) continue;
      if (!latest || session.startedAt > latest.startedAt) latest = session;
    }
    const latestCells = latest ? (cached.get(latest.id) ?? []) : [];
    return { sessionCount: targets.length, pending, cells: [...cells], latestCells };
  }, [data, failedIds]);

  // 保存するとライブクエリが更新され、次のセッションに進む
  const nextPendingId = explored?.pending[0];
  useEffect(() => {
    if (nextPendingId === undefined) return;
    cacheSessionCells(nextPendingId).catch(() => {
      setFailedIds((previous) => new Set(previous).add(nextPendingId));
    });
  }, [nextPendingId]);

  const computing = nextPendingId !== undefined;
  const pendingCount = explored?.pending.length ?? 0;
  if (pendingCount > pendingTotal) setPendingTotal(pendingCount);
  const shapes = useMemo<ExploredShapes | null>(
    () =>
      explored && {
        fine: cellsToCoordinates(explored.cells),
        coarse: cellsToCoordinates(toCoarseCells(explored.cells)),
      },
    [explored],
  );
  const latestBounds = useMemo(
    () => (explored ? coordinatesBounds(cellsToCoordinates(explored.latestCells)) : null),
    [explored],
  );
  const [prefectureFit, setPrefectureFit] = useState<{ latest: Bounds; bounds: Bounds } | null>(null);
  useEffect(() => {
    if (computing || !explored || !latestBounds) return;
    let cancelled = false;
    void withPrefectureBounds(latestBounds, explored.latestCells).then((bounds) => {
      if (!cancelled) setPrefectureFit({ latest: latestBounds, bounds });
    });
    return () => {
      cancelled = true;
    };
  }, [computing, explored, latestBounds]);
  // 古いセルで求めた範囲は使わない
  const bounds = prefectureFit?.latest === latestBounds ? prefectureFit.bounds : null;
  const exploredCenters = useMemo(() => toCellCenters(explored?.cells ?? []), [explored]);
  const regionPercent = useMemo(() => {
    if (!region || region.cellCount === 0) return null;
    const ratio = Math.min(countCellsInRegion(region, exploredCenters) / region.cellCount, 1);
    // 四捨五入すると、全部回っていないのに 100% と表示されることがある
    return Math.floor(ratio * 1000) / 10;
  }, [region, exploredCenters]);

  // next-themes はマウント前に undefined を返すため、テーマが決まってから地図を描画する
  const theme = resolvedTheme === undefined ? undefined : resolvedTheme === "dark" ? "dark" : "light";
  const activeStyle: MapStyleId | undefined = theme === undefined ? undefined : (savedStyle ?? themeMapStyle(theme));
  const mapPalette = activeStyle === undefined ? "" : MAP_STYLES[activeStyle].dark ? "dark" : "light";
  const noSessions = explored !== null && explored.sessionCount === 0;
  const mapLayout = !noSessions && online;
  const mapVisible = mapLayout && explored !== null && activeStyle !== undefined;

  // 値が変わるたびに地図を作り直さないよう、ref で最新の値を参照する
  const shapesRef = useRef(shapes);
  const regionRef = useRef(region);
  const activeStyleRef = useRef(activeStyle);
  const attribution = t("regions.attribution");
  const attributionRef = useRef(attribution);
  const appliedStyleRef = useRef<MapStyleId | null>(null);
  const fittedRef = useRef(false);
  const savedViewRef = useRef<ExploredMapView | null>(null);
  const initialFitRef = useRef<{ bounds: Bounds | null; ready: boolean }>({ bounds: null, ready: false });
  const fitReady = !computing && explored !== null && (latestBounds === null || bounds !== null);

  useEffect(() => {
    shapesRef.current = shapes;
    regionRef.current = region;
    activeStyleRef.current = activeStyle;
    attributionRef.current = attribution;
    initialFitRef.current = { bounds, ready: fitReady };
  }, [shapes, region, activeStyle, attribution, bounds, fitReady]);

  const getFitPadding = useCallback(() => {
    const button = backLinkRef.current;
    const top = button ? button.offsetTop + button.offsetHeight + 16 : 96;
    return { top, bottom: 64, left: 48, right: 48 };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !mapVisible) return;

    let created: MapLibreMap | null = null;
    let cancelled = false;
    let collapseTimer: ReturnType<typeof setTimeout> | undefined;

    void loadMapLibre().then(({ Map, Marker }) => {
      if (cancelled || activeStyleRef.current === undefined) return;
      setMapProgress(MAP_PROGRESS_WEIGHTS.script);
      const styleAtCreate = activeStyleRef.current;
      const style = MAP_STYLES[styleAtCreate];
      const initialFit = initialFitRef.current;
      const boundsAtCreate = initialFit.ready ? initialFit.bounds : null;
      const savedView = detectExploredMapView();
      savedViewRef.current = savedView;

      created = new Map({
        container,
        style: style.url,
        // 前回の位置があればそこで開き、なければ最新のセッション、セルもなければ日本全体
        ...(savedView
          ? { center: savedView.center, zoom: savedView.zoom }
          : boundsAtCreate
            ? { bounds: boundsAtCreate, fitBoundsOptions: { padding: getFitPadding(), maxZoom: FIT_MAX_ZOOM } }
            : { center: [138, 37], zoom: 4 }),
        pitch: style.pitch,
        dragRotate: style.pitch > 0,
        touchPitch: style.pitch > 0,
        attributionControl: { compact: true, customAttribution: attributionRef.current },
      });

      const loadedMap = created;
      fittedRef.current = initialFit.ready;
      appliedStyleRef.current = styleAtCreate;
      fillMissingStyleImages(loadedMap);

      const badgeElement = document.createElement("div");
      // 地図をドラッグする指がバッジの上にあっても地図を動かせるようにする
      badgeElement.className = "pointer-events-none";
      setRegionBadge({ element: badgeElement, marker: new Marker({ element: badgeElement }) });

      let styleLoaded = false;
      const tiles = { started: 0, finished: 0 };
      const reportProgress = () => {
        const tileRatio = tiles.started === 0 ? 0 : Math.min(tiles.finished / tiles.started, 1);
        setMapProgress(
          MAP_PROGRESS_WEIGHTS.script +
            (styleLoaded ? MAP_PROGRESS_WEIGHTS.style : 0) +
            MAP_PROGRESS_WEIGHTS.tiles * tileRatio,
        );
      };
      const handleStyleLoad = () => {
        styleLoaded = true;
        reportProgress();
      };
      const handleTileStart = (event: MapSourceDataEvent) => {
        if (!event.tile) return;
        tiles.started += 1;
        reportProgress();
      };
      // 読み込みを始めたタイルは、完了、中断、エラーのいずれかで終了する
      const handleTileEnd = (event: object) => {
        if (!("tile" in event) || !event.tile) return;
        tiles.finished += 1;
        reportProgress();
      };
      loadedMap.on("style.load", handleStyleLoad);
      loadedMap.on("sourcedataloading", handleTileStart);
      loadedMap.on("sourcedata", handleTileEnd);
      loadedMap.on("sourcedataabort", handleTileEnd);
      loadedMap.on("error", handleTileEnd);
      // 表示後もタイルを読み込むたびに再描画しないよう、閉じたら外す
      stopProgressRef.current = () => {
        loadedMap.off("style.load", handleStyleLoad);
        loadedMap.off("sourcedataloading", handleTileStart);
        loadedMap.off("sourcedata", handleTileEnd);
        loadedMap.off("sourcedataabort", handleTileEnd);
        loadedMap.off("error", handleTileEnd);
      };

      loadedMap.on("load", () => {
        // 未移動なら、移動先のタイルを待つため閉じない
        if (fittedRef.current) setPhase("fading");
        collapseTimer = setTimeout(() => {
          container
            .querySelector(".maplibregl-ctrl-attrib.maplibregl-compact-show")
            ?.classList.remove("maplibregl-compact-show");
        }, ATTRIBUTION_COLLAPSE_MS);

        // 読み込み前にスタイルを切り替えた場合は、切り替え時にセルを追加済み
        if (!loadedMap.getSource("explored-fine") && shapesRef.current) {
          const exploredStyle = buildExploredStyle(shapesRef.current, regionRef.current?.coordinates ?? [], style.dark);
          const baseLayers = loadedMap.getStyle().layers;
          const beforeId = baseLayers[labelLayersStart(baseLayers)]?.id;
          for (const [id, source] of Object.entries(exploredStyle.sources)) loadedMap.addSource(id, source);
          for (const layer of exploredStyle.layers) loadedMap.addLayer(layer, beforeId);
        }
        setMap(loadedMap);
      });
    });

    return () => {
      cancelled = true;
      clearTimeout(collapseTimer);
      appliedStyleRef.current = null;
      stopProgressRef.current = null;
      created?.remove();
      setMap(null);
      setRegion(null);
      setRegionBadge(null);
      setPhase("loading");
      setMapProgress(0);
      setProgressFloor(0);
    };
  }, [mapVisible, getFitPadding]);

  useEffect(() => {
    if (!map || !shapes) return;
    for (const level of LEVELS) {
      map.getSource<GeoJSONSource>(`explored-${level}`)?.setData(toFeature(shapes[level]));
    }
  }, [map, shapes]);

  // 動かし終えたときの中央の市区町村 (縮小時は都道府県) を出す
  useEffect(() => {
    if (!map) return;
    let request = 0;
    const update = () => {
      const level = regionLevelAt(map.getZoom());
      const center = map.getCenter();
      request += 1;
      const current = request;
      (level ? findRegionAt(level, center) : Promise.resolve(null))
        .then((found) => {
          if (current !== request) return;
          setRegion((previous) => (previous?.level === found?.level && previous?.id === found?.id ? previous : found));
        })
        // 境界を読み込めなかったときは、前の表示を残す
        .catch(() => undefined);
    };
    update();
    map.on("moveend", update);
    return () => {
      request += 1;
      map.off("moveend", update);
    };
  }, [map]);

  useEffect(() => {
    if (!map) return;
    const save = () => {
      const { lng, lat } = map.getCenter();
      saveExploredMapView({ center: [lng, lat], zoom: map.getZoom() });
    };
    map.on("moveend", save);
    return () => {
      map.off("moveend", save);
    };
  }, [map]);

  useEffect(() => {
    map?.getSource<GeoJSONSource>(REGION_SOURCE)?.setData(toFeature(region?.coordinates ?? []));
  }, [map, region]);

  const regionLabelPoint = phase === "loading" ? null : (region?.labelPoint ?? null);
  useEffect(() => {
    if (!map || !regionBadge) return;
    if (regionLabelPoint) regionBadge.marker.setLngLat(regionLabelPoint).addTo(map);
    else regionBadge.marker.remove();
  }, [map, regionBadge, regionLabelPoint]);

  // 計算の途中で合わせると範囲が欠けるため、終わってから1回だけ移動し、以降は利用者が動かした位置を保つ
  useEffect(() => {
    if (!map || !fitReady || fittedRef.current) return;
    fittedRef.current = true;
    // 読み込み画面の裏で移動する
    if (bounds && !savedViewRef.current) {
      map.fitBounds(bounds, { padding: getFitPadding(), maxZoom: FIT_MAX_ZOOM, animate: false });
    }
    // idle は描画後にしか発火しないため、移動しない場合も描画させる
    map.once("idle", () => setPhase("fading"));
    map.triggerRepaint();
  }, [map, fitReady, bounds, getFitPadding]);

  useEffect(() => {
    const previousStyle = appliedStyleRef.current;
    if (!map || activeStyle === undefined || previousStyle === null || previousStyle === activeStyle) return;
    appliedStyleRef.current = activeStyle;
    const style = MAP_STYLES[activeStyle];

    // 3D は Liberty を傾けて表示するだけなので、同じ URL のときは読み込み直さない
    if (MAP_STYLES[previousStyle].url !== style.url) {
      // 切り替え中にセルが消えないよう、新しいスタイルに含めてから反映する
      map.setStyle(style.url, {
        transformStyle: (_previous, next) => {
          if (!shapesRef.current) return next;
          const exploredStyle = buildExploredStyle(shapesRef.current, regionRef.current?.coordinates ?? [], style.dark);
          const labelsStart = labelLayersStart(next.layers);
          return {
            ...next,
            sources: { ...next.sources, ...exploredStyle.sources },
            layers: [...next.layers.slice(0, labelsStart), ...exploredStyle.layers, ...next.layers.slice(labelsStart)],
          };
        },
      });
    }
    applyTiltGestures(map, style.pitch);
    if (MAP_STYLES[previousStyle].pitch !== style.pitch) map.easeTo({ pitch: style.pitch, bearing: 0 });
  }, [map, activeStyle]);

  // 上部のぼかしの色を読み込み画面に揃える
  useMapPageBackground(
    mapLayout && activeStyle !== undefined && phase !== "loading" ? MAP_STYLES[activeStyle].swatch.background : null,
  );

  useEffect(() => {
    if (phase === "loading") return;
    stopProgressRef.current?.();
    stopProgressRef.current = null;
    if (phase !== "fading") return;
    const timer = setTimeout(() => setPhase("shown"), LOADING_HOLD_MS + LOADING_FADE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  const rawProgress = pendingTotal === 0 ? mapProgress : (1 - pendingCount / pendingTotal + mapProgress) / 2;
  // 読み込むタイルが増えると割合が下がるため、表示は戻さない
  const loadingProgress = Math.max(progressFloor, Math.min(rawProgress, 0.99));
  if (loadingProgress > progressFloor) setProgressFloor(loadingProgress);
  const progressPercent = phase === "loading" ? Math.floor(loadingProgress * 100) : 100;

  const openStyleSheet = () => {
    // 戻る操作でシートだけを閉じられるようにする
    window.history.pushState({ [STYLE_SHEET_HISTORY_KEY]: true }, "");
    styleSheetEntryRef.current = true;
    setStyleSheetOpen(true);
  };

  const closeStyleSheet = useCallback(() => {
    if (styleSheetEntryRef.current) window.history.back();
    else setStyleSheetOpen(false);
  }, []);

  useEffect(() => {
    if (!styleSheetOpen) return;
    const handlePopState = () => {
      styleSheetEntryRef.current = false;
      setStyleSheetOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeStyleSheet();
    };
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [styleSheetOpen, closeStyleSheet]);

  if (!mapLayout) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 px-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+2.5rem)] sm:px-6">
        <div className="flex flex-col gap-2">
          <div className="mb-2 flex items-center">
            <BackLink href="/" label={tCommon("back")} />
          </div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
        </div>
        {noSessions ? (
          <SessionsEmptyState />
        ) : (
          <p className="flex flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground">
            {t("offline")}
          </p>
        )}
      </main>
    );
  }

  // フェードの終了まで待つと、ボタンのない地図が一瞬見えるため
  const controlsVisible = phase !== "loading";
  const fadeStyle = {
    transitionDuration: `${LOADING_FADE_MS}ms`,
    transitionDelay: controlsVisible ? `${LOADING_HOLD_MS}ms` : "0ms",
  };

  return (
    // iOS のホーム画面アプリでは fixed がずれるため、AppShell の枠に absolute で広げる
    <main className={`explored-map absolute inset-0 bg-muted ${mapPalette}`}>
      <h1 className="sr-only">{t("title")}</h1>
      {/* MapLibre の CSS が position: relative を指定するため、absolute ではなく size-full で広げる */}
      <div ref={containerRef} className="size-full" />
      {phase !== "shown" && (
        // 直前の画面から続けて見えるよう、地図の種類ではなくアプリのテーマに合わせる
        <div
          className={`${theme ?? ""} pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background text-foreground transition-opacity ${phase === "fading" ? "opacity-0" : ""}`}
          style={fadeStyle}
        >
          <p id={loadingLabelId} className="text-sm">
            {t("loading.label")}
          </p>
          <div
            role="progressbar"
            aria-labelledby={loadingLabelId}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
            className="h-1 w-48 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full origin-left bg-foreground transition-transform ease-out"
              style={{ transform: `scaleX(${progressPercent / 100})`, transitionDuration: `${LOADING_HOLD_MS}ms` }}
            />
          </div>
          <p className="text-xs tabular-nums text-muted-foreground">
            {t("loading.percent", { percent: progressPercent })}
          </p>
        </div>
      )}
      <div
        inert={!controlsVisible}
        className={`pointer-events-none absolute inset-0 z-20 transition-opacity ${controlsVisible ? "" : "opacity-0"}`}
        style={fadeStyle}
      >
        <Link
          ref={backLinkRef}
          href="/"
          aria-label={tCommon("back")}
          title={tCommon("back")}
          className={`${MAP_BUTTON_CLASS} left-[calc(env(safe-area-inset-left)+20px)]`}
        >
          <ChevronLeft size={22} className="-translate-x-px" />
        </Link>
        <button
          type="button"
          aria-label={t("styles.open")}
          aria-expanded={styleSheetOpen}
          onClick={openStyleSheet}
          className={`${MAP_BUTTON_CLASS} right-[calc(env(safe-area-inset-right)+20px)]`}
        >
          <Layers className="size-5" />
        </button>
        {region && (
          <p className="absolute left-[calc(env(safe-area-inset-left)+72px)] right-[calc(env(safe-area-inset-right)+72px)] top-[calc(env(safe-area-inset-top)+40px)] truncate text-2xl font-bold leading-10 text-foreground">
            {locale === "ja" ? region.name : region.nameEn}
          </p>
        )}
      </div>
      {regionBadge &&
        regionPercent !== null &&
        createPortal(
          <div className="rounded-xl border border-border bg-background/90 px-3 py-1 text-foreground shadow-sm backdrop-blur-md">
            <span className="font-mono text-xl font-bold tabular-nums">
              {format.number(regionPercent, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
            <span className="ml-0.5 text-xs text-muted-foreground">{tUnits("percent")}</span>
          </div>,
          regionBadge.element,
        )}
      {activeStyle !== undefined && (
        <BottomSheet
          open={styleSheetOpen}
          title={t("styles.title")}
          closeLabel={t("styles.close")}
          onClose={closeStyleSheet}
        >
          <MapStylePicker value={activeStyle} onChange={saveMapStyle} />
        </BottomSheet>
      )}
    </main>
  );
}
