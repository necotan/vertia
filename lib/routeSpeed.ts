import type { GpsPoint } from "@/lib/db/schema";
import { GPS_ACCURACY_LIMIT_M, resolveSpeed } from "@/lib/drive/liveStats";
import { type DistanceUnit, mpsToUnit } from "@/lib/units";

export const speedPaletteIds = ["blue", "standard"] as const;
export type SpeedPaletteId = (typeof speedPaletteIds)[number];

export const SPEED_PALETTES = {
  blue: [
    "#69f3d3",
    "#1cd0dd",
    "#13b5de",
    "#319cd9",
    "#4685ce",
    "#546ec0",
    "#5c5aae",
    "#60479a",
    "#613583",
    "#5f246c",
  ],

  standard: [
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
  ],
} as const satisfies Record<SpeedPaletteId, readonly string[]>;

export const SPEED_BAND_THRESHOLDS: Record<DistanceUnit, readonly number[]> = {
  km: [20, 40, 60, 80, 100, 120, 140, 160, 180],
  mi: [10, 20, 30, 40, 50, 60, 75, 90, 110],
};

export const speedScaleIds = ["relative", "absolute"] as const;
export type SpeedScaleId = (typeof speedScaleIds)[number];

const SPEED_BAND_COUNT = SPEED_BAND_THRESHOLDS.km.length + 1;
// 停車しているだけの記録で、わずかな揺らぎまで濃い色に引き伸ばさないための下限
const MIN_RELATIVE_TOP_SPEED = 1;

// 相対では記録内の最高速度を一番濃い色とし、その比率で塗り分ける
export function speedBandThresholds(scale: SpeedScaleId, unit: DistanceUnit, topSpeed: number): readonly number[] {
  if (scale === "absolute") return SPEED_BAND_THRESHOLDS[unit];
  const top = Math.max(topSpeed, MIN_RELATIVE_TOP_SPEED);
  return Array.from({ length: SPEED_BAND_COUNT - 1 }, (_, index) => (top * (index + 1)) / SPEED_BAND_COUNT);
}

export const SPEED_LEGEND_TICKS = [0, 3, 6, 9] as const;

export function speedBandBoundary(thresholds: readonly number[], index: number): number {
  return index === 0 ? 0 : Math.round(thresholds[index - 1]);
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
export type SpeedRoute = { segments: SpeedSegments; thresholds: readonly number[] };

function speedBand(speedInUnit: number, thresholds: readonly number[]): number {
  return thresholds.filter((threshold) => speedInUnit >= threshold).length;
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
export function buildSpeedSegments(
  points: GpsPoint[],
  unit: DistanceUnit,
  colors: readonly string[],
  scale: SpeedScaleId,
): SpeedRoute {
  const accepted = points.filter((p) => p.accuracy <= GPS_ACCURACY_LIMIT_M);
  const speeds = smoothSpeeds(accepted.map((point, index) => resolveSpeed(accepted[index - 1] ?? null, point)));
  // 最高速度は生の値ではなく塗り分けに使う平滑化後の値から求め、GPS のスパイクで全体が薄くならないようにする
  const segmentSpeeds = accepted.slice(1).map((_, index) => mpsToUnit((speeds[index] + speeds[index + 1]) / 2, unit));
  const topSpeed = segmentSpeeds.reduce((max, speed) => Math.max(max, speed), 0);
  const thresholds = speedBandThresholds(scale, unit, topSpeed);
  const features: SpeedSegments["features"] = [];
  let current: { band: number; coordinates: Coordinate[] } | null = null;

  for (let i = 1; i < accepted.length; i++) {
    const from: Coordinate = [accepted[i - 1].lng, accepted[i - 1].lat];
    const to: Coordinate = [accepted[i].lng, accepted[i].lat];
    const band = speedBand(segmentSpeeds[i - 1], thresholds);
    if (current && current.band === band) {
      current.coordinates.push(to);
      continue;
    }
    current = { band, coordinates: [from, to] };
    features.push({
      type: "Feature",
      properties: { color: colors[band] },
      geometry: { type: "LineString", coordinates: current.coordinates },
    });
  }
  return { segments: { type: "FeatureCollection", features }, thresholds };
}
