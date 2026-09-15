"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { db, type DriveSession } from "@/lib/db/schema";
import { recoverInterruptedSessions } from "@/lib/db/sessionRepository";
import { importSessionFile, type ImportResult } from "@/lib/db/sessionTransfer";
import { sessionDetailHref } from "@/lib/routes";
import { SessionCard } from "./SessionCard";

type ImportFailure = Extract<ImportResult, { ok: false }>["reason"];

export function SessionsScreen() {
  const t = useTranslations("sessions");
  const router = useRouter();
  const sessions = useLiveQuery<DriveSession[]>(() => db.sessions.orderBy("startedAt").reverse().toArray(), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<ImportFailure | null>(null);

  useEffect(() => {
    void recoverInterruptedSessions();
  }, []);

  const handleFile = async (file: File) => {
    setImporting(true);
    setImportError(null);
    const result = await importSessionFile(file);
    setImporting(false);
    if (result.ok) router.push(sessionDetailHref(result.sessionId));
    else setImportError(result.reason);
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+2.5rem)] sm:px-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <Button
            variant="primary"
            onClick={() => inputRef.current?.click()}
            disabled={importing}
            className="min-h-10 px-4 text-sm"
          >
            {importing ? t("import.importing") : t("import.button")}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".gz,application/gzip,application/x-gzip"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void handleFile(file);
            }}
          />
        </div>
        {importError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {t(`import.errors.${importError}`)}
          </p>
        )}
      </div>

      {sessions && sessions.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <FileText className="size-10" strokeWidth={1.5} />
          <p className="text-sm">{t("empty")}</p>
        </div>
      )}

      {sessions && sessions.length > 0 && (
        <ul className="flex flex-col gap-2">
          {sessions.map((session) => (
            <li key={session.id}>
              <SessionCard session={session} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
