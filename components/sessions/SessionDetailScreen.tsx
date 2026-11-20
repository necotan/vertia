"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ImagePlus, Share, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { BackLink } from "@/components/ui/BackLink";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { IconButton } from "@/components/ui/IconButton";
import { useToast } from "@/components/ui/Toast";
import { db, type DriveSession, type SessionSummary, type SessionWeather } from "@/lib/db/schema";
import { deleteSession, getSessionGpsPoints } from "@/lib/db/sessionRepository";
import { exportSessionFile, isTransferSupported } from "@/lib/db/sessionTransfer";
import { downloadBlob } from "@/lib/download";
import { formatDuration } from "@/lib/format";
import { setPendingShareImage } from "@/lib/shareCard/pendingImage";
import {
  celsiusToUnit,
  metersToUnit,
  mpsToUnit,
  speedUnitOf,
  temperatureUnitOf,
  useDistanceUnit,
  windSpeedToUnit,
  windSpeedUnitOf,
} from "@/lib/units";
import { weatherCodeKey } from "@/lib/weather/weatherCode";
import { SessionMap } from "./SessionMap";
import { SpeedChart } from "./SpeedChart";

type StatItem = { label: string; value: string; unit?: string; text?: boolean };

function StatSection({ title, items, headerEnd }: { title: string; items: StatItem[]; headerEnd?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
        {headerEnd}
      </div>
      <dl className="grid grid-flow-col grid-cols-3 grid-rows-[auto_auto] gap-x-2 gap-y-1 rounded-2xl bg-card p-4">
        {items.map((item) => (
          <div key={item.label} className="contents">
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className={`self-baseline ${item.text ? "text-sm" : "font-mono text-lg"}`}>
              {item.value}
              {item.unit && <span className="ml-1 text-xs text-muted-foreground">{item.unit}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function WeatherSection({ weather }: { weather: SessionWeather }) {
  const t = useTranslations("weather");
  const tUnits = useTranslations("units");
  const format = useFormatter();
  const unit = useDistanceUnit();
  const oneDecimal = (value: number) =>
    format.number(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <StatSection
      title={t("title")}
      items={[
        {
          label: t("condition"),
          value: t(`codes.${weatherCodeKey(weather.weatherCode)}`),
          text: true,
        },
        {
          label: t("temperature"),
          value: oneDecimal(celsiusToUnit(weather.temperatureC, unit)),
          unit: tUnits(temperatureUnitOf[unit]),
        },
        {
          label: t("wind"),
          value: oneDecimal(windSpeedToUnit(weather.windSpeedMps, unit)),
          unit: tUnits(windSpeedUnitOf[unit]),
        },
      ]}
      // Open-Meteo のライセンスで、データを表示する場所の隣に出典のリンクが求められている
      headerEnd={
        <p className="text-xs text-muted-foreground">
          {t.rich("attribution", {
            link: (chunks) => (
              <a
                href="https://open-meteo.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
      }
    />
  );
}

function SummarySections({ summary }: { summary: SessionSummary }) {
  const t = useTranslations("sessions.detail");
  const tUnits = useTranslations("units");
  const format = useFormatter();
  const unit = useDistanceUnit();
  const speedUnit = tUnits(speedUnitOf[unit]);
  const speed = (mps: number) => String(Math.round(mpsToUnit(mps, unit)));
  const g = (value: number) => format.number(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <>
      <StatSection
        title={t("sections.overview")}
        items={[
          {
            label: t("distance"),
            value: format.number(metersToUnit(summary.distanceM, unit), { maximumFractionDigits: 1 }),
            unit: tUnits(unit),
          },
          { label: t("duration"), value: formatDuration(summary.durationMs) },
        ]}
      />
      <StatSection
        title={t("sections.speed")}
        items={[
          { label: t("avgSpeed"), value: speed(summary.avgSpeedMps), unit: speedUnit },
          { label: t("medianSpeed"), value: speed(summary.medianSpeedMps), unit: speedUnit },
          { label: t("maxSpeed"), value: speed(summary.maxSpeedMps), unit: speedUnit },
        ]}
      />
      <StatSection
        title={t("sections.gForce")}
        items={[
          { label: t("maxG"), value: g(summary.maxG), unit: tUnits("g") },
          { label: t("maxLateralG"), value: g(summary.maxLateralG), unit: tUnits("g") },
          { label: t("maxLongitudinalG"), value: g(summary.maxLongitudinalG), unit: tUnits("g") },
        ]}
      />
    </>
  );
}

export function SessionDetailScreen() {
  const t = useTranslations("sessions");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const router = useRouter();
  const toast = useToast();
  const id = useSearchParams().get("id") ?? "";
  // 読み込み中は undefined、見つからないときは null
  const session = useLiveQuery<DriveSession | null>(async () => (await db.sessions.get(id)) ?? null, [id]);
  const points = useLiveQuery(() => getSessionGpsPoints(id), [id]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const shareImageInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { blob, filename } = await exportSessionFile(id);
      downloadBlob(blob, filename);
    } catch {
      toast.error(t("detail.export.failed"));
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteSession(id);
      router.replace("/sessions");
    } catch {
      setDeleting(false);
      setConfirmOpen(false);
      toast.error(t("detail.delete.failed"));
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+2.5rem)] sm:px-6">
      <div className="flex flex-col gap-2">
        <div className="mb-2 flex items-center justify-between">
          <BackLink href="/sessions" label={tCommon("back")} />
          {session && (
            <div className="flex items-center gap-3">
              {session.summary && (
                <>
                  {/* 写真の選択画面はタップの処理の中で開かないとブラウザに止められるため、遷移前のこの画面で開く */}
                  <IconButton
                    label={t("detail.shareCard.button")}
                    onClick={() => shareImageInputRef.current?.click()}
                    disabled={deleting}
                  >
                    <ImagePlus size={20} />
                  </IconButton>
                  <input
                    ref={shareImageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      setPendingShareImage(id, file);
                      router.push(`/sessions/share?id=${encodeURIComponent(id)}`);
                    }}
                  />
                </>
              )}
              {isTransferSupported() && (
                <IconButton
                  label={exporting ? t("detail.export.exporting") : t("detail.export.button")}
                  onClick={() => void handleExport()}
                  disabled={exporting || deleting}
                >
                  <Share size={20} />
                </IconButton>
              )}
              <IconButton label={t("detail.delete.button")} onClick={() => setConfirmOpen(true)} disabled={deleting}>
                <Trash2 size={20} />
              </IconButton>
            </div>
          )}
        </div>
        {session && (
          <h1 className="text-2xl font-bold">
            {format.dateTime(session.startedAt, { dateStyle: "medium", timeStyle: "short" })}
          </h1>
        )}
      </div>

      {session === null && !deleting && (
        <p className="text-sm text-muted-foreground">{t("detail.notFound")}</p>
      )}
      {session && points && (
        <>
          <SessionMap points={points} />
          <SpeedChart points={points} startedAt={session.startedAt} />
        </>
      )}
      {session && !session.summary && (
        <p className="text-sm text-muted-foreground">{t("detail.noSummary")}</p>
      )}
      {session?.weather && <WeatherSection weather={session.weather} />}
      {session?.summary && <SummarySections summary={session.summary} />}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("detail.delete.confirmTitle")}
        message={t("detail.delete.confirmMessage")}
        loading={deleting}
        onConfirm={() => void handleDelete()}
      />
    </main>
  );
}
