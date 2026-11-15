"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Check, ImagePlus } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { BackLink } from "@/components/ui/BackLink";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { db, type DriveSession } from "@/lib/db/schema";
import { getSessionGpsPoints } from "@/lib/db/sessionRepository";
import { downloadBlob } from "@/lib/download";
import { GPS_ACCURACY_LIMIT_M } from "@/lib/drive/liveStats";
import { loadCanvasFonts } from "@/lib/drive/renderer/types";
import { formatDuration } from "@/lib/format";
import { findRegionAt, prefectureOf, type Region, type RegionName } from "@/lib/regions";
import { drawShareCard } from "@/lib/shareCard/draw";
import {
  freePositionAt,
  type Rect,
  type ShareCardCell,
  type ShareCardContent,
  type ShareCardLayout,
} from "@/lib/shareCard/layout";
import {
  loadShareCardOptions,
  saveShareCardOptions,
  SHARE_CARD_PRESET_COLORS,
  SHARE_CARD_SCALE_MAX,
  SHARE_CARD_SCALE_MIN,
  shareCardBlocks,
  shareCardItems,
  type ShareCardBlock,
  type ShareCardFreePosition,
  type ShareCardItem,
  type ShareCardOptions,
  type ShareCardPlacement,
  type ShareCardPosition,
} from "@/lib/shareCard/options";
import { loadShareImage, previewSize, renderShareCardBlob, shareCardFileName } from "@/lib/shareCard/output";
import { getPendingShareImage, setPendingShareImage } from "@/lib/shareCard/pendingImage";
import { buildRoutePath } from "@/lib/shareCard/route";
import { celsiusToUnit, metersToUnit, mpsToUnit, speedUnitOf, temperatureUnitOf, useDistanceUnit } from "@/lib/units";
import { weatherCodeKey } from "@/lib/weather/weatherCode";

// 設定を続けて変えている間に、毎回フル解像度で書き出さないよう待つ
const OUTPUT_DEBOUNCE_MS = 300;

// 自由配置はプレビューをドラッグしたときだけになるため、選択肢には出さない
const CORNERS = ["topLeft", "topRight", "bottomLeft", "bottomRight"] as const satisfies readonly ShareCardPosition[];

// 文字の描画順と同じく、情報を経路より手前として当たり判定する
const HIT_TEST_ORDER: readonly ShareCardBlock[] = ["info", "route"];

type Place = { municipality: Region; prefecture: RegionName };
type Places = { start: Place | null; end: Place | null };
type Point = { lat: number; lng: number };
type Drag = { block: ShareCardBlock; offsetX: number; offsetY: number; free: ShareCardFreePosition };

function CheckItem({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className="flex min-h-11 items-center gap-2.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span
        aria-hidden
        className={`flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
          checked ? "border-foreground bg-foreground text-background" : "border-muted-foreground/60"
        }`}
      >
        {checked && <Check className="size-3.5" strokeWidth={3} />}
      </span>
      {label}
    </button>
  );
}

function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function hitBlock(layout: ShareCardLayout, x: number, y: number): ShareCardBlock | null {
  return HIT_TEST_ORDER.find((block) => {
    const rect = layout.rects[block];
    return rect !== undefined && contains(rect, x, y);
  }) ?? null;
}

export function ShareCardScreen() {
  const t = useTranslations("sessions.share");
  const tSessions = useTranslations("sessions");
  const tCommon = useTranslations("common");
  const tUnits = useTranslations("units");
  const tWeather = useTranslations("weather");
  const format = useFormatter();
  const locale = useLocale();
  const unit = useDistanceUnit();
  const toast = useToast();
  const router = useRouter();
  const id = useSearchParams().get("id") ?? "";
  const detailHref = `/sessions/detail?id=${encodeURIComponent(id)}`;
  // 読み込み中は undefined、見つからないときは null
  const session = useLiveQuery<DriveSession | null>(async () => (await db.sessions.get(id)) ?? null, [id]);
  const points = useLiveQuery(() => getSessionGpsPoints(id), [id]);

  const [options, setOptions] = useState<ShareCardOptions>(loadShareCardOptions);
  const [file, setFile] = useState<File | null>(() => getPendingShareImage(id));
  const [loaded, setLoaded] = useState<{ file: File; canvas: HTMLCanvasElement } | null>(null);
  const [fontVersion, setFontVersion] = useState(0);
  const [places, setPlaces] = useState<{ ends: [Point, Point]; result: Places } | null>(null);
  const [output, setOutput] = useState<{ input: unknown; blob: Blob } | null>(null);
  const [tab, setTab] = useState<ShareCardBlock>("route");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layoutRef = useRef<ShareCardLayout | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const frameRef = useRef<number | null>(null);
  const previousFileRef = useRef<File | null>(null);

  // 写真は記録詳細で選んでから開くため、再読み込みなどで写真がないときは記録詳細に戻す
  useEffect(() => {
    if (!file) router.replace(detailHref);
  }, [file, router, detailHref]);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    loadShareImage(file).then(
      (canvas) => {
        if (!cancelled) setLoaded({ file, canvas });
      },
      () => {
        if (cancelled) return;
        toast.error(t("image.failed"));
        // 写真の変更に失敗したときは前の写真のまま続ける
        const previous = previousFileRef.current;
        previousFileRef.current = null;
        if (previous) {
          setPendingShareImage(id, previous);
          setFile(previous);
        } else {
          router.replace(detailHref);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [file, toast, t, router, detailHref, id]);

  // 写真を変更している間は、読み込みが終わるまで前の写真を表示しておく
  const image = loaded?.canvas ?? null;
  const loadingImage = file !== null && loaded?.file !== file;

  const updateOptions = (next: ShareCardOptions) => {
    setOptions(next);
    saveShareCardOptions(next);
  };

  const updatePlacement = (block: ShareCardBlock, placement: ShareCardPlacement) =>
    updateOptions({ ...options, placements: { ...options.placements, [block]: placement } });

  const routePath = useMemo(() => (points ? buildRoutePath(points) : null), [points]);

  const routeEnds = useMemo<[Point, Point] | null>(() => {
    const accepted = points?.filter((p) => p.accuracy <= GPS_ACCURACY_LIMIT_M) ?? [];
    if (accepted.length === 0) return null;
    const first = accepted[0];
    const last = accepted[accepted.length - 1];
    return [
      { lat: first.lat, lng: first.lng },
      { lat: last.lat, lng: last.lng },
    ];
  }, [points]);

  useEffect(() => {
    if (!routeEnds) return;
    let cancelled = false;
    const find = async (point: Point): Promise<Place | null> => {
      try {
        const municipality = await findRegionAt("municipality", point);
        if (!municipality) return null;
        const prefecture = await prefectureOf(municipality);
        return prefecture ? { municipality, prefecture } : null;
      } catch {
        return null;
      }
    };
    void Promise.all([find(routeEnds[0]), find(routeEnds[1])]).then(([start, end]) => {
      if (!cancelled) setPlaces({ ends: routeEnds, result: { start, end } });
    });
    return () => {
      cancelled = true;
    };
  }, [routeEnds]);

  const placeText = useMemo(() => {
    if (!places || places.ends !== routeEnds) return null;
    const { start, end } = places.result;
    const name = (region: RegionName) => (locale === "ja" ? region.name : region.nameEn);
    const withPrefecture = (place: Place) =>
      t("placeName", { prefecture: name(place.prefecture), municipality: name(place.municipality) });
    if (start && end && start.municipality.id !== end.municipality.id) {
      // 同じ都道府県の中の移動では、都道府県名を1回だけ出す
      if (start.prefecture.id === end.prefecture.id) {
        return t("placeRouteInPrefecture", {
          prefecture: name(start.prefecture),
          from: name(start.municipality),
          to: name(end.municipality),
        });
      }
      return t("placeRoute", { from: withPrefecture(start), to: withPrefecture(end) });
    }
    const place = start ?? end;
    return place ? withPrefecture(place) : null;
  }, [places, routeEnds, locale, t]);

  const summary = session?.summary ?? null;
  const weather = session?.weather ?? null;
  const available: Record<ShareCardItem, boolean> = {
    route: routePath !== null,
    date: true,
    place: placeText !== null,
    weather: weather !== null,
    distance: true,
    duration: true,
    speed: true,
    gForce: true,
  };

  const content = useMemo<ShareCardContent | null>(() => {
    if (!session || !summary) return null;
    const show = (item: ShareCardItem) => options.items[item];
    const speed = (mps: number) => String(Math.round(mpsToUnit(mps, unit)));
    const g = (value: number) => format.number(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const rows: ShareCardCell[][] = [];

    const overview: ShareCardCell[] = [];
    if (show("distance")) {
      overview.push({
        label: t("labels.distance"),
        value: format.number(metersToUnit(summary.distanceM, unit), { maximumFractionDigits: 1 }),
        unit: tUnits(unit),
      });
    }
    if (show("duration")) overview.push({ label: t("labels.duration"), value: formatDuration(summary.durationMs) });
    if (overview.length > 0) rows.push(overview);
    if (show("speed")) {
      const speedUnit = tUnits(speedUnitOf[unit]);
      rows.push([
        { label: t("labels.avgSpeed"), value: speed(summary.avgSpeedMps), unit: speedUnit },
        { label: t("labels.maxSpeed"), value: speed(summary.maxSpeedMps), unit: speedUnit },
      ]);
    }
    if (show("gForce")) {
      rows.push([
        { label: t("labels.maxG"), value: g(summary.maxG), unit: tUnits("g") },
        { label: t("labels.maxLateralG"), value: g(summary.maxLateralG), unit: tUnits("g") },
        { label: t("labels.maxLongitudinalG"), value: g(summary.maxLongitudinalG), unit: tUnits("g") },
      ]);
    }

    return {
      route: show("route") ? routePath : null,
      date: show("date") ? format.dateTime(session.startedAt, { dateStyle: "medium", timeStyle: "short" }) : null,
      weather:
        weather && show("weather")
          ? t("weatherValue", {
              condition: tWeather(`codes.${weatherCodeKey(weather.weatherCode)}`),
              temperature: format.number(celsiusToUnit(weather.temperatureC, unit), {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              }),
              unit: tUnits(temperatureUnitOf[unit]),
            })
          : null,
      place: show("place") ? placeText : null,
      rows,
    };
  }, [session, summary, weather, options.items, routePath, placeText, unit, format, t, tUnits, tWeather]);

  // Noto Sans JP は文字ごとに分割されたファイルのため、描く文字を渡して必要な分を読み込む
  const sampleText = content
    ? [
        content.date,
        content.weather,
        content.place,
        ...content.rows.flat().flatMap((cell) => [cell.label, cell.value, cell.unit]),
      ]
        .filter(Boolean)
        .join("")
    : "";
  useEffect(() => {
    if (!sampleText) return;
    let cancelled = false;
    void loadCanvasFonts(sampleText).then(() => {
      if (!cancelled) setFontVersion((version) => version + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [sampleText]);

  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !image || !content) return;
    const drag = dragRef.current;
    const drawOptions: ShareCardOptions = drag
      ? {
          ...options,
          placements: {
            ...options.placements,
            [drag.block]: { ...options.placements[drag.block], position: "free", free: drag.free },
          },
        }
      : options;
    layoutRef.current = drawShareCard(ctx, image, canvas.width, canvas.height, content, drawOptions, drag?.block);
  }, [image, content, options]);

  useEffect(() => {
    drawPreview();
  }, [drawPreview, fontVersion]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  // iOS の navigator.share はタップの直後に呼ばないと拒否されるため、ボタンを押す前に書き出しておく
  const renderInput = useMemo(
    () => (image && content ? { image, content, options, fontVersion } : null),
    [image, content, options, fontVersion],
  );
  useEffect(() => {
    if (!renderInput) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      renderShareCardBlob(renderInput.image, renderInput.content, renderInput.options).then(
        (blob) => {
          if (!cancelled) setOutput({ input: renderInput, blob });
        },
        () => {
          if (!cancelled) toast.error(t("renderFailed"));
        },
      );
    }, OUTPUT_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [renderInput, toast, t]);

  const fileName = session ? shareCardFileName(session.startedAt) : "";
  const outputFile = useMemo(
    () =>
      output && output.input === renderInput ? new File([output.blob], fileName, { type: "image/jpeg" }) : null,
    [output, renderInput, fileName],
  );

  // ファイルの共有に対応していないブラウザ（PC など）ではダウンロードする
  const handleShare = () => {
    if (!outputFile) return;
    if (typeof navigator.canShare !== "function" || !navigator.canShare({ files: [outputFile] })) {
      downloadBlob(outputFile, fileName);
      return;
    }
    navigator.share({ files: [outputFile] }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error(t("shareFailed"));
    });
  };

  const toCanvasPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * canvas.width) / rect.width,
      y: ((event.clientY - rect.top) * canvas.height) / rect.height,
    };
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const layout = layoutRef.current;
    if (!layout) return;
    const { x, y } = toCanvasPoint(event);
    const block = hitBlock(layout, x, y);
    const rect = block ? layout.rects[block] : undefined;
    if (!block || !rect) return;
    const canvas = event.currentTarget;
    canvas.setPointerCapture(event.pointerId);
    dragRef.current = {
      block,
      offsetX: x - rect.x,
      offsetY: y - rect.y,
      free: freePositionAt(layout, rect, canvas.width, canvas.height, rect.x, rect.y),
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const layout = layoutRef.current;
    const drag = dragRef.current;
    const canvas = event.currentTarget;
    const { x, y } = toCanvasPoint(event);
    if (!layout) return;
    if (!drag) {
      canvas.style.cursor = hitBlock(layout, x, y) ? "move" : "";
      return;
    }
    const rect = layout.rects[drag.block];
    if (!rect) return;
    drag.free = freePositionAt(layout, rect, canvas.width, canvas.height, x - drag.offsetX, y - drag.offsetY);
    // pointermove は表示の更新より多く届くことがあるため、1フレームに1回だけ描く
    if (frameRef.current === null) {
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        drawPreview();
      });
    }
  };

  const handlePointerUp = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    // 重ならないようにずらした後の位置を保存する
    // 指を離した位置のままだと、ドラッグしていない状態では、もう一方のブロックをずらす決まりのため、離した瞬間に配置が入れ替わってしまう
    const layout = layoutRef.current;
    const rect = layout?.rects[drag.block];
    const canvas = canvasRef.current;
    const free =
      layout && rect && canvas ? freePositionAt(layout, rect, canvas.width, canvas.height, rect.x, rect.y) : drag.free;
    updatePlacement(drag.block, { ...options.placements[drag.block], position: "free", free });
  };

  const preview = image ? previewSize(image) : null;
  const infoItems = shareCardItems.filter((item) => item !== "route");
  const blockShown: Record<ShareCardBlock, boolean> = {
    route: options.items.route && available.route,
    info: infoItems.some((item) => options.items[item] && available[item]),
  };
  const placement = options.placements[tab];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+2.5rem)] sm:px-6">
      <div className="flex flex-col gap-2">
        <div className="mb-2 flex items-center justify-between">
          <BackLink href={detailHref} label={tCommon("back")} />
          {image && (
            <IconButton
              label={t("image.change")}
              onClick={() => fileInputRef.current?.click()}
              disabled={loadingImage}
            >
              <ImagePlus size={20} />
            </IconButton>
          )}
        </div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const next = event.target.files?.[0];
          // 同じ写真を選び直しても change が届くよう、選択を空に戻す
          event.target.value = "";
          if (!next) return;
          previousFileRef.current = loaded?.file ?? null;
          setPendingShareImage(id, next);
          setFile(next);
        }}
      />

      {session === null && <p className="text-sm text-muted-foreground">{tSessions("detail.notFound")}</p>}
      {session && !summary && <p className="text-sm text-muted-foreground">{tSessions("detail.noSummary")}</p>}

      {file && !image && session !== null && summary !== null && (
        <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
      )}

      {session && summary && image && preview && (
        <>
          <div className="flex justify-center">
            <canvas
              ref={canvasRef}
              width={preview.width}
              height={preview.height}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className={`block h-auto max-h-[60dvh] w-auto max-w-full touch-none select-none rounded-2xl transition-opacity ${
                loadingImage ? "opacity-50" : ""
              }`}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-bold">{t("colors.title")}</span>
            <SegmentedToggle
              label={t("colors.title")}
              value={options.color}
              options={SHARE_CARD_PRESET_COLORS.map(({ id: colorId, value }) => ({
                value,
                label: t(`colors.${colorId}`),
              }))}
              onChange={(color) => updateOptions({ ...options, color })}
              buttonClassName="min-w-12"
            />
          </div>

          <div className="flex flex-col gap-2">
            <SegmentedToggle
              value={tab}
              options={shareCardBlocks.map((block) => ({ value: block, label: t(`blocks.${block}`) }))}
              onChange={setTab}
              className="flex w-full"
              buttonClassName="flex-1 py-1.5 text-sm"
            />

            <div>
              {tab === "route" ? (
                <div className="flex items-center justify-between gap-3 py-3">
                  <label htmlFor="share-card-route" className="text-sm font-bold">
                    {t("rows.show")}
                  </label>
                  <Switch
                    id="share-card-route"
                    checked={blockShown.route}
                    disabled={!available.route}
                    onCheckedChange={(checked) =>
                      updateOptions({ ...options, items: { ...options.items, route: checked } })
                    }
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 py-1.5 sm:grid-cols-3">
                  {infoItems.map((item) => (
                    <CheckItem
                      key={item}
                      label={t(`items.${item}`)}
                      checked={options.items[item] && available[item]}
                      disabled={!available[item]}
                      onChange={() =>
                        updateOptions({ ...options, items: { ...options.items, [item]: !options.items[item] } })
                      }
                    />
                  ))}
                </div>
              )}
              <div
                className={`flex items-center justify-between gap-3 py-3 ${blockShown[tab] ? "" : "opacity-50"}`}
              >
                <span className="text-sm font-bold">{t("rows.position")}</span>
                <SegmentedToggle<ShareCardPosition>
                  label={t("rows.position")}
                  value={placement.position}
                  options={CORNERS.map((position) => ({ value: position, label: t(`positions.${position}`) }))}
                  onChange={(position) => updatePlacement(tab, { ...placement, position })}
                  disabled={!blockShown[tab]}
                />
              </div>
              <div className={`space-y-1 py-3 ${blockShown[tab] ? "" : "opacity-50"}`}>
                <div className="flex items-center justify-between">
                  <label htmlFor="share-card-size" className="text-sm font-bold">
                    {t("rows.size")}
                  </label>
                  <span className="text-xs font-medium tabular-nums text-muted-foreground">
                    {t("scaleValue", { scale: format.number(placement.scale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })}
                  </span>
                </div>
                <input
                  id="share-card-size"
                  type="range"
                  min={SHARE_CARD_SCALE_MIN}
                  max={SHARE_CARD_SCALE_MAX}
                  step={0.1}
                  value={placement.scale}
                  disabled={!blockShown[tab]}
                  onChange={(event) => updatePlacement(tab, { ...placement, scale: Number(event.target.value) })}
                  className="w-full cursor-pointer accent-primary disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          <Button onClick={handleShare} disabled={!outputFile} className="w-full">
            {outputFile ? t("actions.share") : t("actions.preparing")}
          </Button>
        </>
      )}
    </main>
  );
}
