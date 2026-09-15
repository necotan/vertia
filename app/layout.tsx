import type { Metadata, Viewport } from "next";
import { AppProviders } from "@/components/layout/AppProviders";
import { chivoMono, geistSans, notoSansJP } from "@/lib/fonts";
import { defaultLocale, localeInitScript } from "@/lib/i18n/config";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vertia",
  applicationName: "Vertia",
  appleWebApp: {
    capable: true,
    title: "Vertia",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang={defaultLocale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${notoSansJP.variable} ${chivoMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: localeInitScript }} />
      </head>
      <body className="min-h-full font-sans tracking-wide">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
