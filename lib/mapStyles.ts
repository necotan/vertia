import { useSyncExternalStore } from "react";

export const mapStyleIds = ["positron", "bright", "liberty", "dark", "fiord", "3d"] as const;
export type MapStyleId = (typeof mapStyleIds)[number];

export type MapStyleSwatch = {
  background: string;
  water: string;
  park: string;
  road: string;
  roadCasing: string;
  building?: string;
};

export type MapStyle = {
  url: string;
  dark: boolean;
  pitch: number;
  swatch: MapStyleSwatch;
};

const OPENFREEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles";

const LIBERTY_SWATCH: MapStyleSwatch = {
  background: "#f8f4f0",
  water: "#9ebdff",
  park: "#d8e8c8",
  road: "#ffeeaa",
  roadCasing: "#e9ac77",
};

export const MAP_STYLES: Record<MapStyleId, MapStyle> = {
  positron: {
    url: `${OPENFREEMAP_STYLE_URL}/positron`,
    dark: false,
    pitch: 0,
    swatch: { background: "#f2f3f0", water: "#c2c8ca", park: "#e6e9e5", road: "#ffffff", roadCasing: "#d5d5d5" },
  },
  bright: {
    url: `${OPENFREEMAP_STYLE_URL}/bright`,
    dark: false,
    pitch: 0,
    swatch: { background: "#f8f4f0", water: "#aecfe2", park: "#d8e8c8", road: "#ffeeaa", roadCasing: "#e9ac77" },
  },
  liberty: {
    url: `${OPENFREEMAP_STYLE_URL}/liberty`,
    dark: false,
    pitch: 0,
    swatch: LIBERTY_SWATCH,
  },
  dark: {
    url: `${OPENFREEMAP_STYLE_URL}/dark`,
    dark: true,
    pitch: 0,
    swatch: { background: "#0c0c0c", water: "#1b1b1d", park: "#202020", road: "#121212", roadCasing: "#3c3c3c" },
  },
  fiord: {
    url: `${OPENFREEMAP_STYLE_URL}/fiord`,
    dark: true,
    pitch: 0,
    swatch: { background: "#45516e", water: "#38435c", park: "#4a5c69", road: "#3c4357", roadCasing: "#5a6891" },
  },
  "3d": {
    url: `${OPENFREEMAP_STYLE_URL}/liberty`,
    dark: false,
    pitch: 60,
    swatch: { ...LIBERTY_SWATCH, building: "#dcd9d4" },
  },
};

export const MAP_STYLE_STORAGE_KEY = "vertia.mapStyle";
const MAP_STYLE_CHANGE_EVENT = "vertia:map-style-change";

export function isMapStyleId(value: unknown): value is MapStyleId {
  return typeof value === "string" && (mapStyleIds as readonly string[]).includes(value);
}

export function detectMapStyle(): MapStyleId | null {
  try {
    const stored = window.localStorage.getItem(MAP_STYLE_STORAGE_KEY);
    if (isMapStyleId(stored)) return stored;
  } catch {
  }
  return null;
}

export function saveMapStyle(style: MapStyleId): void {
  try {
    window.localStorage.setItem(MAP_STYLE_STORAGE_KEY, style);
  } catch {
  }
  window.dispatchEvent(new CustomEvent(MAP_STYLE_CHANGE_EVENT));
}

export function themeMapStyle(theme: "light" | "dark"): MapStyleId {
  return theme === "dark" ? "dark" : "positron";
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(MAP_STYLE_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(MAP_STYLE_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getServerSnapshot(): MapStyleId | null {
  return null;
}

export function useSavedMapStyle(): MapStyleId | null {
  return useSyncExternalStore(subscribe, detectMapStyle, getServerSnapshot);
}
