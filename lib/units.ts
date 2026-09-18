import { useSyncExternalStore } from "react";

export const distanceUnits = ["km", "mi"] as const;
export type DistanceUnit = (typeof distanceUnits)[number];

// 距離の単位に対応する速度の単位
export const speedUnitOf = { km: "kmh", mi: "mph" } as const satisfies Record<DistanceUnit, string>;
export const temperatureUnitOf = { km: "celsius", mi: "fahrenheit" } as const satisfies Record<DistanceUnit, string>;
export const windSpeedUnitOf = { km: "mps", mi: "mph" } as const satisfies Record<DistanceUnit, string>;

export const defaultDistanceUnit: DistanceUnit = "km";
export const DISTANCE_UNIT_STORAGE_KEY = "vertia.distanceUnit";
export const DISTANCE_UNIT_CHANGE_EVENT = "vertia:distance-unit-change";

const METERS_PER_UNIT: Record<DistanceUnit, number> = { km: 1000, mi: 1609.344 };

export function isDistanceUnit(value: unknown): value is DistanceUnit {
  return typeof value === "string" && (distanceUnits as readonly string[]).includes(value);
}

export function detectDistanceUnit(): DistanceUnit {
  try {
    const stored = window.localStorage.getItem(DISTANCE_UNIT_STORAGE_KEY);
    if (isDistanceUnit(stored)) return stored;
  } catch {
  }
  return defaultDistanceUnit;
}

export function saveDistanceUnit(unit: DistanceUnit): void {
  try {
    window.localStorage.setItem(DISTANCE_UNIT_STORAGE_KEY, unit);
  } catch {
  }
  window.dispatchEvent(new CustomEvent(DISTANCE_UNIT_CHANGE_EVENT));
}

export function metersToUnit(meters: number, unit: DistanceUnit): number {
  return meters / METERS_PER_UNIT[unit];
}

// m/s を km/h または mph に換算する
export function mpsToUnit(mps: number, unit: DistanceUnit): number {
  return (mps * 3600) / METERS_PER_UNIT[unit];
}

// 摂氏を華氏に換算する
export function celsiusToUnit(celsius: number, unit: DistanceUnit): number {
  return unit === "mi" ? celsius * 1.8 + 32 : celsius;
}

// 風速は距離の単位が km のとき m/s のまま、mi のとき mph に換算する
export function windSpeedToUnit(mps: number, unit: DistanceUnit): number {
  return unit === "mi" ? mpsToUnit(mps, unit) : mps;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(DISTANCE_UNIT_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(DISTANCE_UNIT_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getServerSnapshot(): DistanceUnit {
  return defaultDistanceUnit;
}

export function useDistanceUnit(): DistanceUnit {
  return useSyncExternalStore(subscribe, detectDistanceUnit, getServerSnapshot);
}
