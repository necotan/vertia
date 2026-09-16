"use client";

import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

export function SessionsEmptyState({ showAction = true }: { showAction?: boolean }) {
  const t = useTranslations("sessions.empty");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 text-center">
      <FileText className="size-12 text-muted-foreground" strokeWidth={1.5} />
      <div className="flex flex-col gap-3">
        <p className="text-base font-semibold">{t("title")}</p>
        <p className="max-w-xs whitespace-pre-line text-balance text-sm text-muted-foreground">{t("description")}</p>
      </div>
      {showAction && (
        <Link
          href="/drive"
          className="inline-flex min-h-10 items-center rounded-full bg-secondary px-4 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-secondary/80"
        >
          {t("action")}
        </Link>
      )}
    </div>
  );
}
