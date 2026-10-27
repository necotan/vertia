"use client";

import { createContext, useContext } from "react";

// iOS のホーム画面アプリでは fixed の位置がずれるため、ダイアログは body ではなく AppShell の枠の中に描画する
export const OverlayContainerContext = createContext<HTMLElement | null>(null);

export function useOverlayContainer(): HTMLElement | null {
  return useContext(OverlayContainerContext);
}
