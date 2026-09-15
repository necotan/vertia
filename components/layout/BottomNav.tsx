"use client";

import { FileText, Home, Settings, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavKey = "home" | "sessions" | "settings";

const navItems: { key: NavKey; href: string; icon: LucideIcon }[] = [
  { key: "home", href: "/", icon: Home },
  { key: "sessions", href: "/sessions", icon: FileText },
  { key: "settings", href: "/settings", icon: Settings },
];

const HIDDEN_PATH_PREFIXES = ["/drive"];

export function BottomNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  if (HIDDEN_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;

  return (
    <nav
      aria-label={t("label")}
      className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 z-50 h-16 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-full border border-border bg-background/90 backdrop-blur-md"
    >
      <div className="flex h-full items-center justify-around">
        {navItems.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex h-full w-full flex-col items-center justify-center gap-1 transition-colors ${
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{t(item.key)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
