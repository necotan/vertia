"use client";

import { useEffect } from "react";

// iOS のホーム画面アプリは起動直後の表示領域がスクロールするまで古いままで fixed の要素がずれるため、1px スクロールして再計算させる
const NUDGE_DELAYS_MS = [0, 300, 1000];

export function StandaloneViewportFix() {
  useEffect(() => {
    if (!window.matchMedia("(display-mode: standalone)").matches) return;

    const nudge = () => {
      const { scrollX, scrollY } = window;
      window.scrollTo(scrollX, scrollY + 1);
      window.scrollTo(scrollX, scrollY);
    };
    const timers = NUDGE_DELAYS_MS.map((delay) => setTimeout(nudge, delay));
    window.addEventListener("pageshow", nudge);

    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("pageshow", nudge);
    };
  }, []);

  return null;
}
