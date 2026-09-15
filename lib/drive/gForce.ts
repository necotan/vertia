import type { Vec3 } from "@/lib/db/schema";

export const STANDARD_GRAVITY = 9.80665;

// 端末座標系（x=右、y=上、z=画面手前）で表した車両の上、前、右方向の単位ベクトル
export interface Calibration {
  gravity: Vec3;
  up: Vec3;
  forward: Vec3;
  right: Vec3;
}

export interface GForce {
  lateral: number;
  longitudinal: number;
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const length = (a: Vec3): number => Math.sqrt(dot(a, a));

function normalize(a: Vec3): Vec3 | null {
  const len = length(a);
  return len < 1e-6 ? null : scale(a, 1 / len);
}

// ベクトルを up に垂直な平面へ射影して正規化する
function projectToHorizontal(v: Vec3, up: Vec3): Vec3 | null {
  return normalize(sub(v, scale(up, dot(v, up))));
}

// 画面が運転者を向いている前提で、前方向を画面の法線の逆向きとする
// 端末がほぼ水平に置かれている場合は端末上端方向を前とみなす
export function createCalibration(gravity: Vec3): Calibration | null {
  if (Math.abs(length(gravity) - STANDARD_GRAVITY) > 3) return null;
  const up = normalize(gravity);
  if (!up) return null;

  const screenNormal: Vec3 = [0, 0, 1];
  const deviceTop: Vec3 = [0, 1, 0];
  const isFlat = Math.abs(dot(screenNormal, up)) > 0.8;
  const forward = isFlat
    ? projectToHorizontal(deviceTop, up)
    : projectToHorizontal(scale(screenNormal, -1), up);
  if (!forward) return null;

  const right = cross(forward, up);
  return { gravity, up, forward, right };
}

export function toGForce(calibration: Calibration, ax: number, ay: number, az: number): GForce {
  const linear = sub([ax, ay, az], calibration.gravity);
  return {
    lateral: dot(linear, calibration.right) / STANDARD_GRAVITY,
    longitudinal: dot(linear, calibration.forward) / STANDARD_GRAVITY,
  };
}

export class GravityAverager {
  private sum: Vec3 = [0, 0, 0];
  private n = 0;

  add(ax: number, ay: number, az: number): void {
    this.sum = [this.sum[0] + ax, this.sum[1] + ay, this.sum[2] + az];
    this.n += 1;
  }

  get count(): number {
    return this.n;
  }

  result(): Vec3 | null {
    return this.n === 0 ? null : scale(this.sum, 1 / this.n);
  }
}

// 表示用の一次ローパス
export class GForceLowPass {
  private value: GForce | null = null;
  private lastT = 0;

  constructor(private readonly timeConstantMs: number) {}

  update(g: GForce, t: number): GForce {
    if (!this.value) {
      this.value = g;
    } else {
      const dt = Math.max(0, t - this.lastT);
      const alpha = dt / (this.timeConstantMs + dt);
      this.value = {
        lateral: this.value.lateral + alpha * (g.lateral - this.value.lateral),
        longitudinal: this.value.longitudinal + alpha * (g.longitudinal - this.value.longitudinal),
      };
    }
    this.lastT = t;
    return this.value;
  }

  reset(): void {
    this.value = null;
  }
}
