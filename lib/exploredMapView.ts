export const EXPLORED_MAP_VIEW_STORAGE_KEY = "vertia.exploredMapView";

export type ExploredMapView = { center: [number, number]; zoom: number };

function isFiniteInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

export function detectExploredMapView(): ExploredMapView | null {
  try {
    const stored = window.localStorage.getItem(EXPLORED_MAP_VIEW_STORAGE_KEY);
    if (stored === null) return null;
    const value: unknown = JSON.parse(stored);
    if (typeof value !== "object" || value === null || !("center" in value) || !("zoom" in value)) return null;
    const { center, zoom } = value;
    if (!Array.isArray(center) || center.length !== 2) return null;
    const [lng, lat] = center;
    if (!isFiniteInRange(lng, -180, 180) || !isFiniteInRange(lat, -90, 90) || !isFiniteInRange(zoom, 0, 24)) return null;
    return { center: [lng, lat], zoom };
  } catch {
  }
  return null;
}

export function saveExploredMapView(view: ExploredMapView): void {
  try {
    window.localStorage.setItem(EXPLORED_MAP_VIEW_STORAGE_KEY, JSON.stringify(view));
  } catch {
  }
}
