"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { BottomNav } from "@/components/layout/BottomNav";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { I18nProvider } from "@/lib/i18n/I18nProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ServiceWorkerRegister />
      <I18nProvider>
        {children}
        <BottomNav />
      </I18nProvider>
    </ThemeProvider>
  );
}
