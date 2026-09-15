"use client";

import { NextIntlClientProvider } from "next-intl";
import { useSyncExternalStore, type ReactNode } from "react";
import { LOCALE_CHANGE_EVENT, detectLocale, messagesByLocale, type AppLocale } from "./config";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(LOCALE_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(LOCALE_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getServerSnapshot(): AppLocale | null {
  return null;
}

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
};

// 言語設定は localStorage にあるため、静的HTMLには文言を含めずクライアントで確定してから描画する
export function I18nProvider({ children, fallback = null }: Props) {
  const locale = useSyncExternalStore(subscribe, detectLocale, getServerSnapshot);

  if (locale === null) return fallback;

  return (
    <NextIntlClientProvider locale={locale} messages={messagesByLocale[locale]} timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}>
      {children}
    </NextIntlClientProvider>
  );
}
