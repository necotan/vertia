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

// MapLibre の line-gradient に渡す、線の始点からの割合で色を切り替える式
export type SpeedGradient = ["step", ["line-progress"], string, ...(number | string)[]];
export type SpeedRoute = { gradient: SpeedGradient; thresholds: readonly number[] };

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

// line-progress は Web メルカトル座標での距離から求められるため、同じ投影で区間の長さを測る
function mercatorX(lng: number): number {
  return lng / 360 + 0.5;
}

function mercatorY(lat: number): number {
  const sin = Math.sin((lat * Math.PI) / 180);
  return 0.5 - (0.25 * Math.log((1 + sin) / (1 - sin))) / Math.PI;
}

// ルートを1本の線のまま速度帯ごとに塗り分ける（区間ごとに線を分けると、ズームアウト時に短い線が間引かれて途切れる）
export function buildSpeedGradient(
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
  const bands = segmentSpeeds.map((speed) => speedBand(speed, thresholds));
  const lengths = accepted
    .slice(1)
    .map((point, index) =>
      Math.hypot(
        mercatorX(point.lng) - mercatorX(accepted[index].lng),
        mercatorY(point.lat) - mercatorY(accepted[index].lat),
      ),
    );
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);

  const stops: { progress: number; color: string }[] = [];
  let distance = 0;
  for (let i = 1; i < bands.length; i++) {
    distance += lengths[i - 1];
    if (bands[i] === bands[i - 1]) continue;
    const progress = totalLength > 0 ? distance / totalLength : 0;
    const last = stops[stops.length - 1];
    // step の境目は厳密に増加させる必要があるため、長さ0の区間で境目が重なったら後の色で上書きする
    if (last && last.progress === progress) last.color = colors[bands[i]];
    else stops.push({ progress, color: colors[bands[i]] });
  }
  const firstColor = colors[bands[0] ?? 0];
  // step は境目が1つ以上必要なため、色が変わらない記録では終点に同じ色の境目を置く
  if (stops.length === 0) stops.push({ progress: 1, color: firstColor });

  return {
    gradient: ["step", ["line-progress"], firstColor, ...stops.flatMap(({ progress, color }) => [progress, color])],
    thresholds,
  };
}
