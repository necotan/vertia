"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect } from "react";
import { SessionCard, SessionCardSkeleton } from "@/components/sessions/SessionCard";
import { SessionsEmptyState } from "@/components/sessions/SessionsEmptyState";
import { db, type DriveSession } from "@/lib/db/schema";
import { recoverInterruptedSessions } from "@/lib/db/sessionRepository";
import { useDeferredLoading } from "@/lib/hooks/useDeferredLoading";
import { computeHomeStats, type HomeStats as HomeStatsData } from "@/lib/homeStats";
import { HomeStats } from "./HomeStats";

const RECENT_LIMIT = 3;

type HomeData = { recent: DriveSession[]; stats: HomeStatsData | null };

export function HomeScreen() {
  const t = useTranslations("home");
  const data = useLiveQuery<HomeData>(async () => {
    const sessions = await db.sessions.orderBy("startedAt").reverse().toArray();
    return { recent: sessions.slice(0, RECENT_LIMIT), stats: computeHomeStats(sessions, Date.now()) };
  }, []);

  const showSkeleton = useDeferredLoading(data === undefined);
  const ready = !showSkeleton && data !== undefined;

  useEffect(() => {
    void recoverInterruptedSessions();
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+2.5rem)] sm:px-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <Link
        href="/drive"
        className="flex min-h-14 items-center justify-center gap-2 rounded-full bg-primary px-6 text-lg font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {t("startDrive")}
      </Link>

      {ready && data.recent.length === 0 ? (
        <SessionsEmptyState showAction={false} />
      ) : (
        <>
          {(showSkeleton || (ready && data.stats)) && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-muted-foreground">{t("stats.title")}</h2>
              <HomeStats stats={ready ? data.stats : null} />
            </section>
          )}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground">{t("recent.title")}</h2>
            {showSkeleton && (
              <ul className="flex flex-col gap-2" aria-busy="true">
                {[...Array(RECENT_LIMIT)].map((_, i) => (
                  <li key={i}>
                    <SessionCardSkeleton />
                  </li>
                ))}
              </ul>
            )}
            {ready && data.recent.length > 0 && (
              <ul className="flex flex-col gap-2">
                {data.recent.map((session) => (
                  <li key={session.id}>
                    <SessionCard session={session} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
