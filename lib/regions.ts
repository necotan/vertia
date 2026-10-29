import { cellToLatLng } from "h3-js";
import { CELL_RESOLUTION, type MultiPolygonCoordinates } from "@/lib/exploredCells";

// scripts/generateBoundaries.mjs が生成する
const BOUNDARIES_PATH = "/boundaries";

export type RegionLevel = "municipality" | "prefecture";

type Bounds = [number, number, number, number];
type RegionEntry = {
  id: string;
  name: string;
  nameEn: string;
  bbox: Bounds;
  cellCount: number;
  // 範囲内にセルの中心が1つもない小さな島では null
  labelPoint: [number, number] | null;
};
type RegionIndex = { resolution: number } & Record<RegionLevel, RegionEntry[]>;
type RegionGeometry = { type: "MultiPolygon"; coordinates: MultiPolygonCoordinates };

export type Region = RegionEntry & { level: RegionLevel; coordinates: MultiPolygonCoordinates };
export type CellCenter = { lng: number; lat: number };

const responses = new Map<string, Promise<unknown>>();

// 失敗した読み込みは保持せず、次の呼び出しで読み込み直す
function fetchBoundary<T>(path: string): Promise<T> {
  let promise = responses.get(path);
  if (!promise) {
    promise = fetch(`${BOUNDARIES_PATH}/${path}`).then((response) => {
      if (!response.ok) throw new Error(`Failed to load ${path}`);
      return response.json();
    });
    promise.catch(() => responses.delete(path));
    responses.set(path, promise);
  }
  return promise as Promise<T>;
}

function boundsContain([west, south, east, north]: Bounds, { lng, lat }: CellCenter): boolean {
  return lng >= west && lng <= east && lat >= south && lat <= north;
}

function ringContains(ring: number[][], { lng, lat }: CellCenter): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function multiPolygonContains(coordinates: MultiPolygonCoordinates, point: CellCenter): boolean {
  return coordinates.some(
    ([outer, ...holes]) => ringContains(outer, point) && !holes.some((hole) => ringContains(hole, point)),
  );
}

export async function findRegionAt(level: RegionLevel, point: CellCenter): Promise<Region | null> {
  const index = await fetchBoundary<RegionIndex>("index.json");
  // 解像度が違うと、事前に数えたセル数と探索済みのセルを比べられない
  if (index.resolution !== CELL_RESOLUTION) return null;
  const candidates = index[level].filter(({ bbox }) => boundsContain(bbox, point));
  const geometries = await Promise.all(
    candidates.map(({ id }) => fetchBoundary<RegionGeometry>(`${level}/${id}.json`)),
  );
  const matchIndex = geometries.findIndex(({ coordinates }) => multiPolygonContains(coordinates, point));
  if (matchIndex === -1) return null;
  return { ...candidates[matchIndex], level, coordinates: geometries[matchIndex].coordinates };
}

export function toCellCenters(cells: string[]): CellCenter[] {
  return cells.map((cell) => {
    const [lat, lng] = cellToLatLng(cell);
    return { lng, lat };
  });
}

// 生成時のセル数と同じく、中心が範囲内にあるセルを数える
export function countCellsInRegion(region: Region, centers: CellCenter[]): number {
  return centers.filter(
    (center) => boundsContain(region.bbox, center) && multiPolygonContains(region.coordinates, center),
  ).length;
}
