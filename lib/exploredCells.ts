import { areNeighborCells, cellsToMultiPolygon, cellToParent, gridPathCells, latLngToCell } from "h3-js";
import { db, type DriveSession, type GpsPoint, type SessionCells } from "@/lib/db/schema";
import { getSessionGpsPoints } from "@/lib/db/sessionRepository";
import { GPS_ACCURACY_LIMIT_M } from "@/lib/drive/liveStats";
import { haversineMeters } from "@/lib/geo";

// 辺 約0.46km (1Hz の点が高速道路の速度でもセルを飛ばさない)
export const CELL_RESOLUTION = 8;
// 辺 約3.2km (縮小時に細かすぎる描画を避ける)
export const COARSE_CELL_RESOLUTION = 6;
// 上げると保存済みのセルが作り直される
const CELL_ALGORITHM_VERSION = 1;
// トンネル等で途切れた区間は、この距離まで直線で通ったとみなす
const GAP_FILL_MAX_M = 5000;

export type MultiPolygonCoordinates = number[][][][];

// 記録中は点が増え続けるため、記録が終わったセッションだけ
export function hasCellTarget(session: DriveSession): boolean {
  return session.summary !== null;
}

export function isCurrentSessionCells(row: SessionCells): boolean {
  return row.resolution === CELL_RESOLUTION && row.algorithmVersion === CELL_ALGORITHM_VERSION;
}

export function computeSessionCells(points: GpsPoint[]): string[] {
  const cells = new Set<string>();
  let previous: { cell: string; lat: number; lng: number } | null = null;
  for (const { lat, lng, accuracy } of points) {
    if (accuracy > GPS_ACCURACY_LIMIT_M) continue;
    const cell = latLngToCell(lat, lng, CELL_RESOLUTION);
    if (
      previous &&
      previous.cell !== cell &&
      !areNeighborCells(previous.cell, cell) &&
      haversineMeters(previous.lat, previous.lng, lat, lng) <= GAP_FILL_MAX_M
    ) {
      try {
        for (const between of gridPathCells(previous.cell, cell)) cells.add(between);
      } catch {
        // 五角形のセルをまたぐと経路を求められない
      }
    }
    cells.add(cell);
    previous = { cell, lat, lng };
  }
  return [...cells];
}

export async function cacheSessionCells(sessionId: string): Promise<void> {
  const cells = computeSessionCells(await getSessionGpsPoints(sessionId));
  // 計算中に削除されたセッションのセルを残さない
  await db.transaction("rw", db.sessions, db.sessionCells, async () => {
    if (!(await db.sessions.get(sessionId))) return;
    await db.sessionCells.put({
      sessionId,
      resolution: CELL_RESOLUTION,
      algorithmVersion: CELL_ALGORITHM_VERSION,
      cells,
    });
  });
}

export function toCoarseCells(cells: string[]): string[] {
  return [...new Set(cells.map((cell) => cellToParent(cell, COARSE_CELL_RESOLUTION)))];
}

// 隣り合うセルの境界線を出さないため
export function cellsToCoordinates(cells: string[]): MultiPolygonCoordinates {
  return cells.length === 0 ? [] : cellsToMultiPolygon(cells, true);
}

export function coordinatesBounds(coordinates: MultiPolygonCoordinates): [number, number, number, number] | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const polygon of coordinates) {
    // 外周だけで範囲が決まる
    for (const [lng, lat] of polygon[0] ?? []) {
      west = Math.min(west, lng);
      east = Math.max(east, lng);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
  }
  return west === Infinity ? null : [west, south, east, north];
}
