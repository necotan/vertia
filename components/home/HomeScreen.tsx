"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { SessionCard } from "@/components/sessions/SessionCard";
import { db, type DriveSession } from "@/lib/db/schema";
import { recoverInterruptedSessions } from "@/lib/db/sessionRepository";
import { detectDriveCapabilities, isDriveSupported } from "@/lib/sensors/capabilities";

const RECENT_LIMIT = 5;

const noopSubscribe = () => () => {};
const getDriveSupported = () => isDriveSupported(detectDriveCapabilities());
const getServerDriveSupported = () => null;

export function HomeScreen() {
  const t = useTranslations("home");
  const driveSupported = useSyncExternalStore(noopSubscribe, getDriveSupported, getServerDriveSupported);
  const sessions = useLiveQuery<DriveSession[]>(
    () => db.sessions.orderBy("startedAt").reverse().limit(RECENT_LIMIT).toArray(),
    [],
  );

  useEffect(() => {
    void recoverInterruptedSessions();
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+2.5rem)] sm:px-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      {driveSupported === false ? (
        <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
          {t("unsupported")}
        </p>
      ) : (
        <Link
          href="/drive"
          aria-disabled={driveSupported === null}
          className="flex min-h-14 items-center justify-center gap-2 rounded-full bg-primary px-6 text-lg font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t("startDrive")}
        </Link>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">{t("recent.title")}</h2>
        {sessions && sessions.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("recent.empty")}</p>
        )}
        <ul className="flex flex-col gap-2">
          {sessions?.map((session) => (
            <li key={session.id}>
              <SessionCard session={session} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
