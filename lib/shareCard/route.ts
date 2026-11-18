import type { GpsPoint } from "@/lib/db/schema";
import { GPS_ACCURACY_LIMIT_M } from "@/lib/drive/liveStats";
import { mercatorX, mercatorY } from "@/lib/geo";

/** 長辺を 1 とした経路の形。width と height はどちらも 1 以下 */
export type RoutePath = {
  points: readonly (readonly [number, number])[];
  width: number;
  height: number;
};

// 長辺に対するこの割合より細かい曲がりは、カードの大きさでは見分けられないため間引く
const SIMPLIFY_TOLERANCE = 0.002;

function perpendicularDistance(
  [px, py]: readonly [number, number],
  [ax, ay]: readonly [number, number],
  [bx, by]: readonly [number, number],
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(px - ax, py - ay);
  return Math.abs(dy * px - dx * py + bx * ay - by * ax) / length;
}

// Douglas-Peucker
// 長い記録で再帰が深くならないよう、スタックで処理する
function simplify(points: readonly (readonly [number, number])[], tolerance: number): (readonly [number, number])[] {
  if (points.length <= 2) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let maxDistance = 0;
    let maxIndex = -1;
    for (let i = start + 1; i < end; i++) {
      const distance = perpendicularDistance(points[i], points[start], points[end]);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }
    if (maxIndex !== -1 && maxDistance > tolerance) {
      keep[maxIndex] = 1;
      stack.push([start, maxIndex], [maxIndex, end]);
    }
  }
  return points.filter((_, index) => keep[index] === 1);
}

/** 地図の経路と同じく、精度の悪い点は除いてメルカトル投影する */
export function buildRoutePath(gpsPoints: GpsPoint[]): RoutePath | null {
  const accepted = gpsPoints.filter((p) => p.accuracy <= GPS_ACCURACY_LIMIT_M);
  if (accepted.length < 2) return null;

  const projected = accepted.map((p) => [mercatorX(p.lng), mercatorY(p.lat)] as const);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of projected) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const span = Math.max(maxX - minX, maxY - minY);
  if (span === 0) return null;

  const normalized = projected.map(([x, y]) => [(x - minX) / span, (y - minY) / span] as const);
  return {
    points: simplify(normalized, SIMPLIFY_TOLERANCE),
    width: (maxX - minX) / span,
    height: (maxY - minY) / span,
  };
}
