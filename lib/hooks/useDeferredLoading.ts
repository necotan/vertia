"use client";

import { useLayoutEffect, useRef, useState } from "react";

const DEFAULT_SHOW_DELAY_MS = 150;
const DEFAULT_MIN_VISIBLE_MS = 300;

type Options = {
  showDelayMs?: number;
  minVisibleMs?: number;
};

// 短い読み込みでは表示せず、表示した場合は最短時間が経つまでデータ表示に切り替えない
export function useDeferredLoading(loading: boolean, options: Options = {}): boolean {
  const { showDelayMs = DEFAULT_SHOW_DELAY_MS, minVisibleMs = DEFAULT_MIN_VISIBLE_MS } = options;
  const [visible, setVisible] = useState(false);
  // スケルトンを表示し始めた時刻（未表示なら null）
  const shownAtRef = useRef<number | null>(null);

  // useEffect の場合、描画後までの実行が遅れ、読み込み完了のコミットより先に表示タイマーが発火して一瞬表示されることがあるため、コミット時に同期でタイマーを止める
  useLayoutEffect(() => {
    if (loading) {
      if (shownAtRef.current !== null) return;
      const timer = setTimeout(() => {
        shownAtRef.current = Date.now();
        setVisible(true);
      }, showDelayMs);
      return () => clearTimeout(timer);
    }

    if (shownAtRef.current === null) return;
    const remaining = Math.max(0, shownAtRef.current + minVisibleMs - Date.now());
    const timer = setTimeout(() => {
      shownAtRef.current = null;
      setVisible(false);
    }, remaining);
    return () => clearTimeout(timer);
  }, [loading, showDelayMs, minVisibleMs]);

  return visible;
}
