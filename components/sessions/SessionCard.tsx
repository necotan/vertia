"use client";

import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import type { DriveSession } from "@/lib/db/schema";
import { formatDuration } from "@/lib/format";
import { mpsToKmh } from "@/lib/geo";
import { sessionDetailHref } from "@/lib/routes";

export function SessionCard({ session }: { session: DriveSession }) {
  const t = useTranslations("sessions.card");
  const format = useFormatter();

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
              {format.number(session.summary.distanceM / 1000, { maximumFractionDigits: 1 })} km
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("duration")}</dt>
            <dd className="font-mono">{formatDuration(session.summary.durationMs)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("maxSpeed")}</dt>
            <dd className="font-mono">{Math.round(mpsToKmh(session.summary.maxSpeedMps))} km/h</dd>
          </div>
        </dl>
      )}
    </Link>
  );
}
