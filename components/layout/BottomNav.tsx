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
  // タップした項目を遷移完了前にアクティブ表示する先取り状態
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [lastPathname, setLastPathname] = useState(pathname);

  // 遷移が終わったら先取り状態を消す（残したままだと、あとで同じ画面に戻ったときに古い項目がアクティブになる）
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setPendingHref(null);
  }

  // 遷移が完了しないまま先取り表示が残り続けないようにする
  useEffect(() => {
    if (pendingHref === null) return;
    const timer = setTimeout(() => setPendingHref(null), PENDING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pendingHref]);

  if (HIDDEN_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;

  const currentHref = pendingHref ?? pathname;

  return (
    <nav
      aria-label={t("label")}
      className="absolute bottom-9 left-1/2 z-50 h-16 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-full border border-border bg-background/90 backdrop-blur-md"
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
                if (!matchesHref(pathname, item.href)) setPendingHref(item.href);
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
