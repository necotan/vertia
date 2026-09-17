import type { GpsPoint } from "@/lib/db/schema";
import { GPS_ACCURACY_LIMIT_M, resolveSpeed } from "./liveStats";

export interface SpeedSample {
  // 記録開始からの経過時間（秒）
  t: number;
  mps: number;
}

// グラフに渡す点の上限（これを超えるときは区間ごとに平均して間引く）
const MAX_SAMPLES = 600;

export function buildSpeedSeries(points: GpsPoint[], startedAt: number): SpeedSample[] {
  const samples: SpeedSample[] = [];
  let previous: GpsPoint | null = null;
  for (const point of points) {
    if (point.accuracy > GPS_ACCURACY_LIMIT_M) continue;
    const speed = resolveSpeed(previous, point);
    previous = point;
    if (speed === null) continue;
    samples.push({ t: Math.max(0, (point.t - startedAt) / 1000), mps: speed });
  }
  return downsample(samples, MAX_SAMPLES);
}

function downsample(samples: SpeedSample[], max: number): SpeedSample[] {
  if (samples.length <= max) return samples;
  const bucketSize = samples.length / max;
  const result: SpeedSample[] = [];
  for (let i = 0; i < max; i++) {
    const bucket = samples.slice(Math.floor(i * bucketSize), Math.floor((i + 1) * bucketSize));
    if (bucket.length === 0) continue;
    const sum = bucket.reduce((acc, s) => ({ t: acc.t + s.t, mps: acc.mps + s.mps }), { t: 0, mps: 0 });
    result.push({ t: sum.t / bucket.length, mps: sum.mps / bucket.length });
  }
  return result;
}
