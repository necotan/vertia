"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { BottomNav } from "./BottomNav";

// iOS のホーム画面アプリでは fixed の要素が起動直後や画面遷移のあとにずれるため、画面全体の枠の中に absolute で配置し、スクロールも枠の中で行う
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="relative h-dvh overflow-hidden">
      <ToastProvider>
        <div ref={scrollRef} className="h-full overflow-y-auto overscroll-y-contain">
          {/* 内容が少なくてもスクロールとバウンドが効くよう、枠より 1px 高くする */}
          <div className="min-h-[calc(100%+1px)]">{children}</div>
        </div>
        <BottomNav />
      </ToastProvider>
    </div>
  );
}
