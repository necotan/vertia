"use client";

import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { SkeletonText } from "@/components/ui/Skeleton";
import type { DriveSession } from "@/lib/db/schema";
import { formatDuration } from "@/lib/format";
import { sessionDetailHref } from "@/lib/routes";
import { metersToUnit, mpsToUnit, speedUnitOf, useDistanceUnit } from "@/lib/units";

const SKELETON_STAT_KEYS = ["distance", "duration", "maxSpeed"] as const;

export function SessionCard({ session }: { session: DriveSession }) {
  const t = useTranslations("sessions.card");
  const tUnits = useTranslations("units");
  const format = useFormatter();
  const unit = useDistanceUnit();

  return (
    <Link
      href={sessionDetailHref(session.id)}
      className="block rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-muted"
    >
      <span className="text-sm font-medium">
        {format.dateTime(session.startedAt, { dateStyle: "medium", timeStyle: "short" })}
      </span>
      {session.summary && (
        <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">{t("distance")}</dt>
            <dd className="font-mono">
              {format.number(metersToUnit(session.summary.distanceM, unit), { maximumFractionDigits: 1 })} {tUnits(unit)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("duration")}</dt>
            <dd className="font-mono">{formatDuration(session.summary.durationMs)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("maxSpeed")}</dt>
            <dd className="font-mono">
              {Math.round(mpsToUnit(session.summary.maxSpeedMps, unit))} {tUnits(speedUnitOf[unit])}
            </dd>
          </div>
        </dl>
      )}
    </Link>
  );
}

// 読み込み中に SessionCard と同じ位置・高さで表示するプレースホルダ（外枠とグリッドは実カードと同じクラス、ラベルは実テキスト、日付と数値だけスケルトン）
export function SessionCardSkeleton() {
  const t = useTranslations("sessions.card");

  return (
    <div className="block rounded-2xl border border-border bg-card p-4">
      {/* 実カードの日付行は親フォントの 1lh で高さが決まり、skeleton は overflow hidden でベースライン揃えが効かないため、1lh の枠の中央に置く */}
      <div className="flex min-h-[1lh] items-center">
        <SkeletonText size="sm" className="w-36" />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        {SKELETON_STAT_KEYS.map((key) => (
          <div key={key}>
            <dt className="text-xs text-muted-foreground">{t(key)}</dt>
            <dd className="font-mono">
              <SkeletonText size="sm" className="w-16" />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
