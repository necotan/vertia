"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { I18nProvider } from "@/lib/i18n/I18nProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ServiceWorkerRegister />
      <I18nProvider>
        <AppShell>{children}</AppShell>
      </I18nProvider>
    </ThemeProvider>
  );
}
