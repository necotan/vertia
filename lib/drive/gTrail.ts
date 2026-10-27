import type { GForce } from "./gForce";

export const G_TRAIL_DURATION_MS = 1500;

export interface GTrailPoint {
  t: number;
  g: GForce;
}

export class GTrail {
  // 描画側が参照を保持し続けられるよう、配列は差し替えずにその場で更新する
  readonly points: GTrailPoint[] = [];

  add(g: GForce, t: number): void {
    this.points.push({ t, g });
    const cutoff = t - G_TRAIL_DURATION_MS;
    let expired = 0;
    while (expired < this.points.length && this.points[expired].t < cutoff) expired++;
    if (expired > 0) this.points.splice(0, expired);
  }

  clear(): void {
    this.points.length = 0;
  }
}
