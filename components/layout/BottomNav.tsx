"use client";

import { FileText, Home, Settings, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type NavKey = "home" | "sessions" | "settings";

const navItems: { key: NavKey; href: string; icon: LucideIcon }[] = [
  { key: "home", href: "/", icon: Home },
  { key: "sessions", href: "/sessions", icon: FileText },
  { key: "settings", href: "/settings", icon: Settings },
];

const HIDDEN_PATH_PREFIXES = ["/drive"];

const PENDING_TIMEOUT_MS = 5000;

function matchesHref(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function BottomNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  // タップした項目を遷移完了前にアクティブ表示する先取り状態（タップ時の pathname を持ち、遷移後に pathname が変わると無効になる）
  const [pending, setPending] = useState<{ href: string; fromPathname: string } | null>(null);
  const pendingHref = pending !== null && pending.fromPathname === pathname ? pending.href : null;

  // 遷移が完了しないまま先取り表示が残り続けないようにする
  useEffect(() => {
    if (pendingHref === null) return;
    const timer = setTimeout(() => setPending(null), PENDING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pendingHref]);

  if (HIDDEN_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;

  const currentHref = pendingHref ?? pathname;

  return (
    <nav
      aria-label={t("label")}
      className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 z-50 h-16 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-full border border-border bg-background/90 backdrop-blur-md"
    >
      <div className="flex h-full items-center justify-around">
        {navItems.map((item) => {
          const isActive = matchesHref(currentHref, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={matchesHref(pathname, item.href) ? "page" : undefined}
              onClick={() => {
                if (!matchesHref(pathname, item.href)) setPending({ href: item.href, fromPathname: pathname });
              }}
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
