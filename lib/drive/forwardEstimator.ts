import type { Vec3 } from "@/lib/db/schema";
import type { MotionSample } from "@/lib/sensors/motion";
import { add, dot, length, normalize, scale, STANDARD_GRAVITY, sub, type Calibration } from "./gForce";

const SMOOTHING_TIME_CONSTANT_MS = 300;
const STRAIGHT_YAW_RATE_DEG_PER_S = 3;
// 高速ではヨーレートが小さくても横Gが出るため、速度が不明な間は推定しない
const MAX_CENTRIPETAL_G = 0.03;
const MIN_ACCEL_G = 0.08;
const MAX_ACCEL_G = 0.8;
const MIN_ACCEPTED_MS = 4000;
const MIN_CONSISTENCY = 0.85;
const MAX_DEVIATION_RAD = (70 * Math.PI) / 180;
const MIN_UPDATE_RAD = (1 * Math.PI) / 180;
const MAX_SAMPLE_GAP_MS = 500;

function angleBetween(a: Vec3, b: Vec3): number {
  return Math.acos(Math.min(1, Math.max(-1, dot(a, b))));
}

// 減速は加速と向きが逆になるため、初期の前方側へ反転してから合成する
export class ForwardEstimator {
  private smoothed: Vec3 | null = null;
  private smoothedYawRate = 0;
  private lastT = 0;
  private sum: Vec3 = [0, 0, 0];
  private magnitudeSum = 0;
  private acceptedMs = 0;
  private output: Vec3 | null = null;

  constructor(private readonly initial: Calibration) {}

  get forward(): Vec3 | null {
    return this.output;
  }

  update(sample: MotionSample, speedMps: number | null): Vec3 | null {
    if (sample.ra === null || sample.rb === null || sample.rg === null) return null;
    const { up, gravity } = this.initial;
    const linear = sub([sample.ax, sample.ay, sample.az], gravity);
    const horizontal = sub(linear, scale(up, dot(linear, up)));
    // rotationRate の alpha・beta・gamma はそれぞれ端末の z・x・y 軸まわり
    const yawRate = Math.abs(dot([sample.rb, sample.rg, sample.ra], up));

    const dt = sample.t - this.lastT;
    this.lastT = sample.t;
    if (!this.smoothed || dt <= 0 || dt > MAX_SAMPLE_GAP_MS) {
      this.smoothed = horizontal;
      this.smoothedYawRate = yawRate;
      return null;
    }
    const alpha = dt / (SMOOTHING_TIME_CONSTANT_MS + dt);
    this.smoothed = add(this.smoothed, scale(sub(horizontal, this.smoothed), alpha));
    this.smoothedYawRate += alpha * (yawRate - this.smoothedYawRate);

    const magnitudeG = length(this.smoothed) / STANDARD_GRAVITY;
    if (speedMps === null || this.smoothedYawRate >= STRAIGHT_YAW_RATE_DEG_PER_S) return null;
    const centripetalG = (speedMps * this.smoothedYawRate * Math.PI) / 180 / STANDARD_GRAVITY;
    if (centripetalG > MAX_CENTRIPETAL_G) return null;
    if (magnitudeG < MIN_ACCEL_G || magnitudeG > MAX_ACCEL_G) return null;

    const aligned = dot(this.smoothed, this.initial.forward) < 0 ? scale(this.smoothed, -1) : this.smoothed;
    this.sum = add(this.sum, scale(aligned, dt));
    this.magnitudeSum += length(aligned) * dt;
    this.acceptedMs += dt;
    return this.evaluate();
  }

  private evaluate(): Vec3 | null {
    if (this.acceptedMs < MIN_ACCEPTED_MS) return null;
    if (length(this.sum) / this.magnitudeSum < MIN_CONSISTENCY) return null;
    const estimate = normalize(this.sum);
    if (!estimate || angleBetween(estimate, this.initial.forward) > MAX_DEVIATION_RAD) return null;
    if (this.output && angleBetween(estimate, this.output) < MIN_UPDATE_RAD) return null;
    this.output = estimate;
    return estimate;
  }
}
