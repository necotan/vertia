import { useSyncExternalStore } from "react";
import { type SpeedPaletteId, speedPaletteIds } from "@/lib/routeSpeed";

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

export const SPEED_PALETTE_STORAGE_KEY = "vertia.speedPalette";
const SPEED_PALETTE_CHANGE_EVENT = "vertia:speed-palette-change";
export const defaultSpeedPalette: SpeedPaletteId = "blue";

export function isSpeedPaletteId(value: unknown): value is SpeedPaletteId {
  return typeof value === "string" && (speedPaletteIds as readonly string[]).includes(value);
}

export function detectSpeedPalette(): SpeedPaletteId {
  try {
    const stored = window.localStorage.getItem(SPEED_PALETTE_STORAGE_KEY);
    if (isSpeedPaletteId(stored)) return stored;
  } catch {
  }
  return defaultSpeedPalette;
}

export function saveSpeedPalette(palette: SpeedPaletteId): void {
  try {
    window.localStorage.setItem(SPEED_PALETTE_STORAGE_KEY, palette);
  } catch {
  }
  window.dispatchEvent(new CustomEvent(SPEED_PALETTE_CHANGE_EVENT));
}

function subscribeSpeedPalette(onChange: () => void): () => void {
  window.addEventListener(SPEED_PALETTE_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SPEED_PALETTE_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSpeedPaletteServerSnapshot(): SpeedPaletteId {
  return defaultSpeedPalette;
}

export function useSpeedPalette(): SpeedPaletteId {
  return useSyncExternalStore(subscribeSpeedPalette, detectSpeedPalette, getSpeedPaletteServerSnapshot);
}
