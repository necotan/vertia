"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, Layers, Map as MapIcon } from "lucide-react";
import type { GeoJSONSource, Map as MapLibreMap, TransformStyleFunction } from "maplibre-gl";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { fillMissingStyleImages, loadMapLibre, useMapPageBackground, useOnline } from "@/lib/mapLibre";
import { MAP_STYLES, type MapStyleId, saveMapStyle, themeMapStyle, useSavedMapStyle } from "@/lib/mapStyles";

const ATTRIBUTION_COLLAPSE_MS = 5000;
const PLACEHOLDER_FADE_MS = 300;
const FINE_MIN_ZOOM = 9;
const FIT_MAX_ZOOM = 13;

const EXPLORED_COLORS = {
  light: { fill: "#4f5bd5", line: "#3b45b8" },
  dark: { fill: "#8f86f5", line: "#b3adf9" },
} as const;

const STYLE_SHEET_HISTORY_KEY = "vertiaExploredMapStyleSheet";

const MAP_BUTTON_CLASS =
  "pointer-events-auto absolute top-[calc(env(safe-area-inset-top)+40px)] flex size-10 items-center justify-center rounded-full border border-border bg-background/90 text-foreground backdrop-blur-md transition-colors hover:bg-muted";

type StyleSpecification = Parameters<TransformStyleFunction>[1];
type ExploredStyle = Pick<StyleSpecification, "sources" | "layers">;
type ExploredShapes = { fine: MultiPolygonCoordinates; coarse: MultiPolygonCoordinates };
type ExploredData = { sessions: DriveSession[]; cells: SessionCells[] };
type Bounds = [number, number, number, number];

const LEVELS = ["coarse", "fine"] as const;

function toFeature(coordinates: MultiPolygonCoordinates) {
  return { type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates } } as const;
}

function buildExploredStyle(shapes: ExploredShapes, darkStyle: boolean): ExploredStyle {
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
  return { sources, layers };
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
  const { resolvedTheme } = useTheme();
  const online = useOnline();
  const savedStyle = useSavedMapStyle();
  const containerRef = useRef<HTMLDivElement>(null);
  const backLinkRef = useRef<HTMLAnchorElement>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [map, setMap] = useState<MapLibreMap | null>(null);
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
    return { sessionCount: targets.length, pending, cells: [...cells] };
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
  const shapes = useMemo<ExploredShapes | null>(
    () =>
      explored && {
        fine: cellsToCoordinates(explored.cells),
        coarse: cellsToCoordinates(toCoarseCells(explored.cells)),
      },
    [explored],
  );
  const bounds = useMemo(() => (shapes ? coordinatesBounds(shapes.fine) : null), [shapes]);

  // next-themes はマウント前に undefined を返すため、テーマが決まってから地図を描画する
  const theme = resolvedTheme === undefined ? undefined : resolvedTheme === "dark" ? "dark" : "light";
  const activeStyle: MapStyleId | undefined = theme === undefined ? undefined : (savedStyle ?? themeMapStyle(theme));
  const mapPalette = activeStyle === undefined ? "" : MAP_STYLES[activeStyle].dark ? "dark" : "light";
  const noSessions = explored !== null && explored.sessionCount === 0;
  const mapLayout = !noSessions && online;
  const mapVisible = mapLayout && explored !== null && activeStyle !== undefined;

  // 値が変わるたびに地図を作り直さないよう、ref で最新の値を参照する
  const shapesRef = useRef(shapes);
  const activeStyleRef = useRef(activeStyle);
  const appliedStyleRef = useRef<MapStyleId | null>(null);
  const fittedRef = useRef(false);
  const initialFitRef = useRef<{ bounds: Bounds | null; ready: boolean }>({ bounds: null, ready: false });
  const fitReady = !computing && explored !== null;

  useEffect(() => {
    shapesRef.current = shapes;
    activeStyleRef.current = activeStyle;
    initialFitRef.current = { bounds, ready: fitReady };
  }, [shapes, activeStyle, bounds, fitReady]);

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

    void loadMapLibre().then(({ Map }) => {
      if (cancelled || activeStyleRef.current === undefined) return;
      const styleAtCreate = activeStyleRef.current;
      const style = MAP_STYLES[styleAtCreate];
      const initialFit = initialFitRef.current;
      const boundsAtCreate = initialFit.ready ? initialFit.bounds : null;

      created = new Map({
        container,
        style: style.url,
        // セルがなければ日本全体
        ...(boundsAtCreate
          ? { bounds: boundsAtCreate, fitBoundsOptions: { padding: getFitPadding(), maxZoom: FIT_MAX_ZOOM } }
          : { center: [138, 37], zoom: 4 }),
        pitch: style.pitch,
        dragRotate: style.pitch > 0,
        touchPitch: style.pitch > 0,
        attributionControl: { compact: true },
      });

      const loadedMap = created;
      fittedRef.current = initialFit.ready;
      appliedStyleRef.current = styleAtCreate;
      fillMissingStyleImages(loadedMap);
      loadedMap.on("load", () => {
        setPhase("fading");
        collapseTimer = setTimeout(() => {
          container
            .querySelector(".maplibregl-ctrl-attrib.maplibregl-compact-show")
            ?.classList.remove("maplibregl-compact-show");
        }, ATTRIBUTION_COLLAPSE_MS);

        // 読み込み前にスタイルを切り替えた場合は、切り替え時にセルを追加済み
        if (!loadedMap.getSource("explored-fine") && shapesRef.current) {
          const exploredStyle = buildExploredStyle(shapesRef.current, style.dark);
          for (const [id, source] of Object.entries(exploredStyle.sources)) loadedMap.addSource(id, source);
          for (const layer of exploredStyle.layers) loadedMap.addLayer(layer);
        }
        setMap(loadedMap);
      });
    });

    return () => {
      cancelled = true;
      clearTimeout(collapseTimer);
      appliedStyleRef.current = null;
      created?.remove();
      setMap(null);
      setPhase("loading");
    };
  }, [mapVisible, getFitPadding]);

  useEffect(() => {
    if (!map || !shapes) return;
    for (const level of LEVELS) {
      map.getSource<GeoJSONSource>(`explored-${level}`)?.setData(toFeature(shapes[level]));
    }
  }, [map, shapes]);

  // 計算の途中で合わせると範囲が欠けるため、終わってから1回だけ移動し、以降は利用者が動かした位置を保つ
  useEffect(() => {
    if (!map || computing || explored === null || fittedRef.current) return;
    fittedRef.current = true;
    if (bounds) map.fitBounds(bounds, { padding: getFitPadding(), maxZoom: FIT_MAX_ZOOM });
  }, [map, computing, explored, bounds, getFitPadding]);

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
          const exploredStyle = buildExploredStyle(shapesRef.current, style.dark);
          return {
            ...next,
            sources: { ...next.sources, ...exploredStyle.sources },
            layers: [...next.layers, ...exploredStyle.layers],
          };
        },
      });
    }
    applyTiltGestures(map, style.pitch);
    if (MAP_STYLES[previousStyle].pitch !== style.pitch) map.easeTo({ pitch: style.pitch, bearing: 0 });
  }, [map, activeStyle]);

  useMapPageBackground(mapLayout && activeStyle !== undefined ? MAP_STYLES[activeStyle].swatch.background : null);

  useEffect(() => {
    if (phase !== "fading") return;
    const timer = setTimeout(() => setPhase("shown"), PLACEHOLDER_FADE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

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

  return (
    // iOS のホーム画面アプリでは fixed がずれるため、AppShell の枠に absolute で広げる
    <main className={`explored-map absolute inset-0 bg-muted ${mapPalette}`}>
      <h1 className="sr-only">{t("title")}</h1>
      {/* MapLibre の CSS が position: relative を指定するため、absolute ではなく size-full で広げる */}
      <div ref={containerRef} className="size-full" />
      {phase !== "shown" && (
        <div
          aria-hidden
          className={`skeleton pointer-events-none absolute inset-0 z-10 flex items-center justify-center transition-opacity ${phase === "fading" ? "opacity-0" : ""}`}
          style={{ transitionDuration: `${PLACEHOLDER_FADE_MS}ms` }}
        >
          {/* シマーの ::after より手前に出すため */}
          <MapIcon className="relative size-10 text-muted-foreground" />
        </div>
      )}
      {/* 地図の読み込みに失敗しても戻れるよう、読み込み中も出す */}
      <div className="pointer-events-none absolute inset-0 z-20">
        <Link
          ref={backLinkRef}
          href="/"
          aria-label={tCommon("back")}
          title={tCommon("back")}
          className={`${MAP_BUTTON_CLASS} left-[calc(env(safe-area-inset-left)+20px)]`}
        >
          <ChevronLeft size={22} className="-translate-x-px" />
        </Link>
      </div>
      <div
        inert={!controlsVisible}
        className={`pointer-events-none absolute inset-0 z-20 transition-opacity ${controlsVisible ? "" : "opacity-0"}`}
        style={{ transitionDuration: `${PLACEHOLDER_FADE_MS}ms` }}
      >
        <button
          type="button"
          aria-label={t("styles.open")}
          aria-expanded={styleSheetOpen}
          onClick={openStyleSheet}
          className={`${MAP_BUTTON_CLASS} right-[calc(env(safe-area-inset-right)+20px)]`}
        >
          <Layers className="size-5" />
        </button>
      </div>
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
