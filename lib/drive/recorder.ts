import { appendSessionData, completeSession, createSession, setSessionWeather } from "@/lib/db/sessionRepository";
import type { GpsPoint, MotionChunk, SessionCalibration, SessionSummary, SessionWeather } from "@/lib/db/schema";
import type { GeoFix } from "@/lib/sensors/geolocation";
import type { MotionSample } from "@/lib/sensors/motion";

const FLUSH_INTERVAL_MS = 1000;

type NullableColumn = "lax" | "lay" | "laz" | "ra" | "rb" | "rg";
const NULLABLE_COLUMNS: NullableColumn[] = ["lax", "lay", "laz", "ra", "rb", "rg"];

// 列内の一部だけが null の場合は NaN で埋め、全て null なら列ごと null にする
function toNullableColumn(samples: MotionSample[], key: NullableColumn): Float32Array | null {
  if (samples.every((s) => s[key] === null)) return null;
  return Float32Array.from(samples, (s) => s[key] ?? Number.NaN);
}

export class SessionRecorder {
  private gpsBuffer: GpsPoint[] = [];
  private motionBuffer: MotionSample[] = [];
  private pendingGps: GpsPoint[] = [];
  private pendingChunks: MotionChunk[] = [];
  private seq = 0;
  private timer: number | null = null;
  private flushing: Promise<void> = Promise.resolve();
  private errorReported = false;
  private weatherSaved = false;

  private constructor(
    readonly sessionId: string,
    readonly startedAt: number,
    private readonly onSaveError: () => void,
  ) {}

  static async start(
    calibration: SessionCalibration,
    startedAt: number,
    onSaveError: () => void,
  ): Promise<SessionRecorder> {
    const session = await createSession(calibration, startedAt);
    const recorder = new SessionRecorder(session.id, startedAt, onSaveError);
    recorder.timer = window.setInterval(() => void recorder.flush(), FLUSH_INTERVAL_MS);
    return recorder;
  }

  addFix(fix: GeoFix): void {
    this.gpsBuffer.push({ sessionId: this.sessionId, ...fix });
  }

  addMotion(sample: MotionSample): void {
    this.motionBuffer.push(sample);
  }

  // 記録開始時の天気を1度だけ書き込む（失敗しても記録は続けるため、次の取得で再試行する）
  setWeather(weather: SessionWeather): void {
    if (this.weatherSaved) return;
    this.weatherSaved = true;
    void setSessionWeather(this.sessionId, weather).catch(() => {
      this.weatherSaved = false;
    });
  }

  async stop(endedAt: number, summary: SessionSummary): Promise<void> {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    await this.flush();
    if (this.pendingGps.length > 0 || this.pendingChunks.length > 0) {
      throw new Error("Failed to flush session data");
    }
    await completeSession(this.sessionId, endedAt, summary);
  }

  private takeChunk(): MotionChunk | null {
    const samples = this.motionBuffer;
    if (samples.length === 0) return null;
    this.motionBuffer = [];
    const t0 = samples[0].t;
    const [lax, lay, laz, ra, rb, rg] = NULLABLE_COLUMNS.map((key) => toNullableColumn(samples, key));
    return {
      sessionId: this.sessionId,
      seq: this.seq++,
      t0,
      dt: Float32Array.from(samples, (s) => s.t - t0),
      ax: Float32Array.from(samples, (s) => s.ax),
      ay: Float32Array.from(samples, (s) => s.ay),
      az: Float32Array.from(samples, (s) => s.az),
      lax,
      lay,
      laz,
      ra,
      rb,
      rg,
    };
  }

  // 書き込みは直列化し、失敗したデータは次回の書き込みで再試行する
  private flush(): Promise<void> {
    this.flushing = this.flushing.then(async () => {
      const chunk = this.takeChunk();
      if (chunk) this.pendingChunks.push(chunk);
      this.pendingGps.push(...this.gpsBuffer);
      this.gpsBuffer = [];
      if (this.pendingGps.length === 0 && this.pendingChunks.length === 0) return;

      const gps = this.pendingGps;
      const chunks = this.pendingChunks;
      try {
        await appendSessionData(this.sessionId, gps, chunks, Date.now());
        this.pendingGps = this.pendingGps.slice(gps.length);
        this.pendingChunks = this.pendingChunks.slice(chunks.length);
      } catch {
        if (!this.errorReported) {
          this.errorReported = true;
          this.onSaveError();
        }
      }
    });
    return this.flushing;
  }
}
