import type { GpsPoint, MotionChunk, SessionCalibration, SessionSummary } from "@/lib/db/schema";
import { haversineMeters } from "@/lib/geo";
import type { GeoFix } from "@/lib/sensors/geolocation";
import { createCalibration, GForceLowPass, toGForce, type GForce } from "./gForce";

// この精度より悪いGPS点は統計に使用しない
export const GPS_ACCURACY_LIMIT_M = 50;
// 中央値速度はこの速度以上の点のみを対象にする
export const MEDIAN_MIN_SPEED_MPS = 5 / 3.6;
// 停車中のGPSの揺らぎで距離が増えないようにするための閾値
const STATIONARY_SPEED_MPS = 0.5;
export const G_DISPLAY_TIME_CONSTANT_MS = 150;

type SpeedFix = Pick<GeoFix, "t" | "lat" | "lng" | "speed">;

// 端末の速度が得られない場合は前回の点との距離と時間から求める
export function resolveSpeed(previous: SpeedFix | null, fix: SpeedFix): number | null {
  if (fix.speed !== null) return fix.speed;
  if (!previous) return null;
  const dtSec = (fix.t - previous.t) / 1000;
  if (dtSec <= 0) return null;
  return haversineMeters(previous.lat, previous.lng, fix.lat, fix.lng) / dtSec;
}

export interface LiveStatsSnapshot {
  distanceM: number;
  durationMs: number;
  avgSpeedMps: number | null;
  medianSpeedMps: number | null;
  maxSpeedMps: number | null;
}

export class LiveStats {
  private startedAt = 0;
  private distanceM = 0;
  private maxSpeedMps: number | null = null;
  private sortedSpeeds: number[] = [];
  private lastAccepted: SpeedFix | null = null;
  private maxG = 0;
  private maxLateralG = 0;
  private maxLongitudinalG = 0;

  start(startedAt: number): void {
    this.startedAt = startedAt;
    this.distanceM = 0;
    this.maxSpeedMps = null;
    this.sortedSpeeds = [];
    this.lastAccepted = null;
    this.maxG = 0;
    this.maxLateralG = 0;
    this.maxLongitudinalG = 0;
  }

  addFix(fix: GeoFix): void {
    if (fix.accuracy > GPS_ACCURACY_LIMIT_M) return;
    const previous = this.lastAccepted;
    const speed = resolveSpeed(previous, fix);
    this.lastAccepted = fix;
    if (speed === null) return;

    if (previous && speed >= STATIONARY_SPEED_MPS) {
      this.distanceM += haversineMeters(previous.lat, previous.lng, fix.lat, fix.lng);
    }
    this.maxSpeedMps = this.maxSpeedMps === null ? speed : Math.max(this.maxSpeedMps, speed);
    if (speed >= MEDIAN_MIN_SPEED_MPS) insertSorted(this.sortedSpeeds, speed);
  }

  addG(g: GForce): void {
    const lateral = Math.abs(g.lateral);
    const longitudinal = Math.abs(g.longitudinal);
    this.maxLateralG = Math.max(this.maxLateralG, lateral);
    this.maxLongitudinalG = Math.max(this.maxLongitudinalG, longitudinal);
    this.maxG = Math.max(this.maxG, Math.hypot(lateral, longitudinal));
  }

  snapshot(now: number): LiveStatsSnapshot {
    const durationMs = Math.max(0, now - this.startedAt);
    return {
      distanceM: this.distanceM,
      durationMs,
      avgSpeedMps: durationMs > 0 && this.lastAccepted ? this.distanceM / (durationMs / 1000) : null,
      medianSpeedMps: median(this.sortedSpeeds),
      maxSpeedMps: this.maxSpeedMps,
    };
  }

  toSummary(endedAt: number): SessionSummary {
    const s = this.snapshot(endedAt);
    return {
      distanceM: s.distanceM,
      durationMs: s.durationMs,
      maxSpeedMps: s.maxSpeedMps ?? 0,
      avgSpeedMps: s.avgSpeedMps ?? 0,
      medianSpeedMps: s.medianSpeedMps ?? 0,
      maxG: this.maxG,
      maxLateralG: this.maxLateralG,
      maxLongitudinalG: this.maxLongitudinalG,
    };
  }
}

function insertSorted(values: number[], value: number): void {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (values[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  values.splice(lo, 0, value);
}

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = sorted.length >>> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// 保存済みデータからサマリーを再計算する
// 最大Gは記録中と同じく表示用ローパス後の値で求める
export function computeSummaryFromData(
  startedAt: number,
  endedAt: number,
  calibration: SessionCalibration,
  points: GpsPoint[],
  chunks: MotionChunk[],
): SessionSummary {
  const stats = new LiveStats();
  stats.start(startedAt);
  for (const point of points) stats.addFix(point);

  const cal = createCalibration(calibration.gravity);
  if (cal) {
    const lowPass = new GForceLowPass(G_DISPLAY_TIME_CONSTANT_MS);
    for (const chunk of chunks) {
      for (let i = 0; i < chunk.dt.length; i++) {
        const g = toGForce(cal, chunk.ax[i], chunk.ay[i], chunk.az[i]);
        stats.addG(lowPass.update(g, chunk.t0 + chunk.dt[i]));
      }
    }
  }
  return stats.toSummary(endedAt);
}
