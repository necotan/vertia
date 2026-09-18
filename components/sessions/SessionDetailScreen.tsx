"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { db, type DriveSession, type SessionSummary, type SessionWeather } from "@/lib/db/schema";
import { deleteSession, getSessionGpsPoints } from "@/lib/db/sessionRepository";
import { exportSessionFile, isTransferSupported } from "@/lib/db/sessionTransfer";
import { formatDuration } from "@/lib/format";
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

function StatSection({ title, items }: { title: string; items: StatItem[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      <dl className="grid grid-cols-3 gap-2 rounded-2xl border border-border bg-card p-4">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col gap-1">
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className={item.text ? "text-sm" : "font-mono text-lg"}>
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
          { label: t("maxG"), value: g(summary.maxG), unit: "G" },
          { label: t("maxLateralG"), value: g(summary.maxLateralG), unit: "G" },
          { label: t("maxLongitudinalG"), value: g(summary.maxLongitudinalG), unit: "G" },
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
  // 地図と速度グラフで使用する GPS 点
  const points = useLiveQuery(() => getSessionGpsPoints(id), [id]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { blob, filename } = await exportSessionFile(id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
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
        <Link
          href="/sessions"
          aria-label={tCommon("back")}
          className="-ml-3 -mt-2 mb-2 flex size-11 items-center justify-center rounded-full text-foreground hover:bg-muted"
        >
          <ChevronLeft className="size-6" />
        </Link>
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

      {session && (
        <div className="mt-8 flex flex-col gap-4">
          {isTransferSupported() && (
            <Button variant="primary" onClick={() => void handleExport()} disabled={exporting || deleting}>
              {exporting ? t("detail.export.exporting") : t("detail.export.button")}
            </Button>
          )}
          <Button variant="danger" onClick={() => setConfirmOpen(true)} disabled={deleting}>
            {t("detail.delete.button")}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={t("detail.delete.confirmTitle")}
        message={t("detail.delete.confirmMessage")}
        confirmLabel={t("detail.delete.confirm")}
        cancelLabel={tCommon("cancel")}
        destructive
        busy={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmOpen(false)}
      />
    </main>
  );
}
