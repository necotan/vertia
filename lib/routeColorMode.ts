import { useSyncExternalStore } from "react";

export const ROUTE_SPEED_COLORS_STORAGE_KEY = "vertia.routeSpeedColors";
const ROUTE_SPEED_COLORS_CHANGE_EVENT = "vertia:route-speed-colors-change";
const DEFAULT_ROUTE_SPEED_COLORS = true;

export function detectRouteSpeedColors(): boolean {
  try {
    const stored = window.localStorage.getItem(ROUTE_SPEED_COLORS_STORAGE_KEY);
    if (stored === "on") return true;
    if (stored === "off") return false;
  } catch {
  }
  return DEFAULT_ROUTE_SPEED_COLORS;
}

export function saveRouteSpeedColors(enabled: boolean): void {
  try {
    window.localStorage.setItem(ROUTE_SPEED_COLORS_STORAGE_KEY, enabled ? "on" : "off");
  } catch {
  }
  window.dispatchEvent(new CustomEvent(ROUTE_SPEED_COLORS_CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(ROUTE_SPEED_COLORS_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(ROUTE_SPEED_COLORS_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getServerSnapshot(): boolean {
  return DEFAULT_ROUTE_SPEED_COLORS;
}

export function useRouteSpeedColors(): boolean {
  return useSyncExternalStore(subscribe, detectRouteSpeedColors, getServerSnapshot);
}
