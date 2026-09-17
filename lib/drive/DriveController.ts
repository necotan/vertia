import { detectDriveCapabilities, isDriveSupported } from "@/lib/sensors/capabilities";
import { watchGeolocation, type GeoErrorKind, type GeoFix } from "@/lib/sensors/geolocation";
import {
  requestMotionPermission,
  subscribeMotion,
  waitForMotionData,
  type MotionPermissionResult,
  type MotionSample,
} from "@/lib/sensors/motion";
import { WakeLockKeeper, type WakeLockStatus } from "@/lib/sensors/wakeLock";
import { createCalibration, GForceLowPass, GravityAverager, toGForce, type Calibration } from "./gForce";
import { G_DISPLAY_TIME_CONSTANT_MS, LiveStats, resolveSpeed } from "./liveStats";
import { SessionRecorder } from "./recorder";
import type { DriveFrame } from "./renderer/types";

export type DrivePhase = "idle" | "starting" | "calibrating" | "ready" | "recording" | "saving" | "error";

export type DriveErrorCode =
  | "unsupported"
  | "motionDenied"
  | "motionUnavailable"
  | "geolocationDenied"
  | "geolocationUnavailable"
  | "saveFailed";

export interface DriveUiState {
  phase: DrivePhase;
  error: DriveErrorCode | null;
  wakeLock: WakeLockStatus;
}

export const initialDriveUiState: DriveUiState = { phase: "idle", error: null, wakeLock: "idle" };

const MOTION_CHECK_TIMEOUT_MS = 2000;
const CALIBRATION_DURATION_MS = 1500;
const CALIBRATION_MIN_SAMPLES = 20;
// この時間GPSの更新がなければ速度表示を無効にする
const GPS_STALE_MS = 5000;

// 高頻度の値は frame に保持し、React には粗い状態変化だけを通知する
export class DriveController {
  private ui: DriveUiState = initialDriveUiState;
  private readonly frame: DriveFrame = {
    speedMps: null,
    gpsAccuracyM: null,
    g: null,
    avgMps: null,
    medianMps: null,
    maxMps: null,
    recordingElapsedMs: null,
  };
  private readonly wakeLock: WakeLockKeeper;
  private readonly lowPass = new GForceLowPass(G_DISPLAY_TIME_CONSTANT_MS);
  private readonly stats = new LiveStats();
  private calibration: Calibration | null = null;
  private averager: GravityAverager | null = null;
  private calibrationStartedAt = 0;
  private lastFix: GeoFix | null = null;
  private lastFixReceivedAt = 0;
  private recorder: SessionRecorder | null = null;
  private unsubscribeMotion: (() => void) | null = null;
  private unsubscribeGeo: (() => void) | null = null;
  private disposed = false;

  constructor(private readonly onUiChange: (state: DriveUiState) => void) {
    this.wakeLock = new WakeLockKeeper((wakeLock) => this.setUi({ wakeLock }));
  }

  readonly getFrame = (): DriveFrame => {
    const now = Date.now();
    if (this.lastFix && now - this.lastFixReceivedAt > GPS_STALE_MS) {
      this.frame.speedMps = null;
      this.frame.gpsAccuracyM = null;
    }
    this.frame.recordingElapsedMs = this.recorder ? now - this.recorder.startedAt : null;
    return this.frame;
  };

  start(): Promise<void> {
    if (this.ui.phase !== "idle" && this.ui.phase !== "error") return Promise.resolve();
    const permission = requestMotionPermission();
    void this.wakeLock.enable();
    return this.startAfterPermission(permission);
  }

  recalibrate(): void {
    if (this.ui.phase !== "ready") return;
    this.beginCalibration();
  }

  async startRecording(): Promise<void> {
    if (this.ui.phase !== "ready" || !this.calibration) return;
    const startedAt = Date.now();
    try {
      this.recorder = await SessionRecorder.start({ gravity: this.calibration.gravity }, startedAt, () =>
        this.setUi({ error: "saveFailed" }),
      );
    } catch {
      this.setUi({ error: "saveFailed" });
      return;
    }
    this.stats.start(startedAt);
    this.setUi({ phase: "recording", error: null });
  }

  async stopRecording(): Promise<void> {
    const recorder = this.recorder;
    if (this.ui.phase !== "recording" || !recorder) return;
    this.setUi({ phase: "saving" });
    const endedAt = Date.now();
    const summary = this.stats.toSummary(endedAt);
    this.recorder = null;
    try {
      await recorder.stop(endedAt, summary);
      this.setUi({ phase: "ready" });
    } catch {
      this.setUi({ phase: "ready", error: "saveFailed" });
    }
    this.frame.avgMps = null;
    this.frame.medianMps = null;
    this.frame.maxMps = null;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.stopSensors();
    await this.wakeLock.disable();
    const recorder = this.recorder;
    this.recorder = null;
    if (recorder) {
      const endedAt = Date.now();
      await recorder.stop(endedAt, this.stats.toSummary(endedAt)).catch(() => undefined);
    }
  }

  private async startAfterPermission(permission: Promise<MotionPermissionResult>): Promise<void> {
    this.setUi({ phase: "starting", error: null });

    if (!isDriveSupported(detectDriveCapabilities())) return this.fail("unsupported");
    const result = await permission;
    if (result === "unsupported") return this.fail("unsupported");
    if (result === "denied") return this.fail("motionDenied");
    if (!(await waitForMotionData(MOTION_CHECK_TIMEOUT_MS))) return this.fail("motionUnavailable");
    if (this.disposed) return;

    this.unsubscribeGeo = watchGeolocation(this.handleFix, this.handleGeoError);
    this.unsubscribeMotion = subscribeMotion(this.handleMotion);
    this.beginCalibration();
  }

  private beginCalibration(): void {
    this.averager = new GravityAverager();
    this.calibrationStartedAt = 0;
    this.lowPass.reset();
    this.frame.g = null;
    this.setUi({ phase: "calibrating" });
  }

  private readonly handleMotion = (sample: MotionSample): void => {
    if (this.averager) {
      if (this.calibrationStartedAt === 0) this.calibrationStartedAt = sample.t;
      this.averager.add(sample.ax, sample.ay, sample.az);
      const elapsed = sample.t - this.calibrationStartedAt;
      if (elapsed >= CALIBRATION_DURATION_MS && this.averager.count >= CALIBRATION_MIN_SAMPLES) {
        const gravity = this.averager.result();
        const calibration = gravity ? createCalibration(gravity) : null;
        if (calibration) {
          this.calibration = calibration;
          this.averager = null;
          this.setUi({ phase: "ready" });
        } else {
          this.beginCalibration();
        }
      }
      return;
    }

    if (!this.calibration) return;
    const g = this.lowPass.update(toGForce(this.calibration, sample.ax, sample.ay, sample.az), sample.t);
    this.frame.g = g;
    if (this.recorder) {
      this.recorder.addMotion(sample);
      this.stats.addG(g);
    }
  };

  private readonly handleFix = (fix: GeoFix): void => {
    const speed = resolveSpeed(this.lastFix, fix);
    this.lastFix = fix;
    this.lastFixReceivedAt = Date.now();
    this.frame.speedMps = speed;
    this.frame.gpsAccuracyM = fix.accuracy;
    if (this.ui.error === "geolocationUnavailable") this.setUi({ error: null });

    if (this.recorder) {
      this.recorder.addFix(fix);
      this.stats.addFix(fix);
      const s = this.stats.snapshot(Date.now());
      this.frame.avgMps = s.avgSpeedMps;
      this.frame.medianMps = s.medianSpeedMps;
      this.frame.maxMps = s.maxSpeedMps;
    }
  };

  private readonly handleGeoError = (kind: GeoErrorKind): void => {
    if (kind === "denied") {
      void this.failWhileRunning("geolocationDenied");
    } else if (kind === "unavailable" && !this.lastFix) {
      this.setUi({ error: "geolocationUnavailable" });
    }
  };

  private async failWhileRunning(code: DriveErrorCode): Promise<void> {
    if (this.recorder) await this.stopRecording();
    this.fail(code);
  }

  private fail(code: DriveErrorCode): void {
    this.stopSensors();
    void this.wakeLock.disable();
    this.setUi({ phase: "error", error: code });
  }

  private stopSensors(): void {
    this.unsubscribeMotion?.();
    this.unsubscribeGeo?.();
    this.unsubscribeMotion = null;
    this.unsubscribeGeo = null;
    this.averager = null;
    this.calibration = null;
    this.lastFix = null;
    this.frame.speedMps = null;
    this.frame.gpsAccuracyM = null;
    this.frame.g = null;
  }

  private setUi(patch: Partial<DriveUiState>): void {
    if (this.disposed) return;
    this.ui = { ...this.ui, ...patch };
    this.onUiChange(this.ui);
  }
}
