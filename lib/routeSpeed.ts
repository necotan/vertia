import type { GpsPoint } from "@/lib/db/schema";
import { GPS_ACCURACY_LIMIT_M, resolveSpeed } from "@/lib/drive/liveStats";
import { type DistanceUnit, mpsToUnit } from "@/lib/units";

export const SPEED_BAND_COLORS = [
  "#4870c8",
  "#3496c3",
  "#319b90",
  "#3fa866",
  "#9bc754",
  "#d2b43d",
  "#d17a3e",
  "#d16262",
  "#9e3737",
  "#a844b5",
] as const;

export const SPEED_BAND_THRESHOLDS: Record<DistanceUnit, readonly number[]> = {
  km: [20, 40, 60, 80, 100, 120, 140, 160, 180],
  mi: [10, 20, 30, 40, 50, 60, 75, 90, 110],
};

export const SPEED_LEGEND_TICKS = [0, 3, 6, 9] as const;

export function speedBandBoundary(unit: DistanceUnit, index: number): number {
  return index === 0 ? 0 : SPEED_BAND_THRESHOLDS[unit][index - 1];
}

// GPS の揺らぎで境目の色が細かく入れ替わらないよう、前後の点と平均する
const SMOOTHING_RADIUS = 1;

type Coordinate = [number, number];

export type SpeedSegmentFeature = {
  type: "Feature";
  properties: { color: string };
  geometry: { type: "LineString"; coordinates: Coordinate[] };
};
export type SpeedSegments = { type: "FeatureCollection"; features: SpeedSegmentFeature[] };

function speedBand(speedInUnit: number, unit: DistanceUnit): number {
  return SPEED_BAND_THRESHOLDS[unit].filter((threshold) => speedInUnit >= threshold).length;
}

function smoothSpeeds(speeds: (number | null)[]): number[] {
  let fallback = speeds.find((speed) => speed !== null) ?? 0;
  return speeds.map((_, index) => {
    const window = speeds
      .slice(Math.max(0, index - SMOOTHING_RADIUS), index + SMOOTHING_RADIUS + 1)
      .filter((speed): speed is number => speed !== null);
    if (window.length === 0) return fallback;
    fallback = window.reduce((sum, speed) => sum + speed, 0) / window.length;
    return fallback;
  });
}

// 同じ速度帯が続く区間を1本の線にまとめる
export function buildSpeedSegments(points: GpsPoint[], unit: DistanceUnit): SpeedSegments {
  const accepted = points.filter((p) => p.accuracy <= GPS_ACCURACY_LIMIT_M);
  const speeds = smoothSpeeds(accepted.map((point, index) => resolveSpeed(accepted[index - 1] ?? null, point)));
  const features: SpeedSegments["features"] = [];
  let current: { band: number; coordinates: Coordinate[] } | null = null;

  for (let i = 1; i < accepted.length; i++) {
    const from: Coordinate = [accepted[i - 1].lng, accepted[i - 1].lat];
    const to: Coordinate = [accepted[i].lng, accepted[i].lat];
    const band = speedBand(mpsToUnit((speeds[i - 1] + speeds[i]) / 2, unit), unit);
    if (current && current.band === band) {
      current.coordinates.push(to);
      continue;
    }
    current = { band, coordinates: [from, to] };
    features.push({
      type: "Feature",
      properties: { color: SPEED_BAND_COLORS[band] },
      geometry: { type: "LineString", coordinates: current.coordinates },
    });
  }
  return { type: "FeatureCollection", features };
}
