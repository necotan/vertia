import { Dexie, type EntityTable } from "dexie";

export type Vec3 = [number, number, number];

export type SessionStatus = "recording" | "completed" | "interrupted";

export interface SessionSummary {
  distanceM: number;
  durationMs: number;
  maxSpeedMps: number;
  avgSpeedMps: number;
  medianSpeedMps: number;
  maxG: number;
  maxLateralG: number;
  maxLongitudinalG: number;
}

// 記録開始時点の天気（換算は表示時に行うため、値は SI 単位のまま保存する）
export interface SessionWeather {
  // API が返した観測時刻
  observedAt: number;
  // WMO weather code
  weatherCode: number;
  temperatureC: number;
  windSpeedMps: number;
  // 取得に使用した座標
  lat: number;
  lng: number;
}

export interface SessionCalibration {
  // 停車中に平均した accelerationIncludingGravity（端末座標系、m/s²）
  gravity: Vec3;
}

export interface DriveSession {
  id: string;
  status: SessionStatus;
  startedAt: number;
  endedAt: number | null;
  // 記録中に最後に書き込んだ時刻 (中断セッションの終了時刻の推定に使う)
  updatedAt: number;
  calibration: SessionCalibration;
  summary: SessionSummary | null;
  // 取得できなかった場合と、天気の保存に対応する前の記録は null
  weather: SessionWeather | null;
  schemaVersion: number;
}

export interface GpsPoint {
  id?: number;
  sessionId: string;
  t: number;
  lat: number;
  lng: number;
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  speed: number | null;
  heading: number | null;
}

// 50〜60Hz のモーションデータを約1秒ごとにまとめて保存する
export interface MotionChunk {
  id?: number;
  sessionId: string;
  seq: number;
  t0: number;
  dt: Float32Array;
  ax: Float32Array;
  ay: Float32Array;
  az: Float32Array;
  lax: Float32Array | null;
  lay: Float32Array | null;
  laz: Float32Array | null;
  ra: Float32Array | null;
  rb: Float32Array | null;
  rg: Float32Array | null;
}

export const SESSION_SCHEMA_VERSION = 2;

class VertiaDatabase extends Dexie {
  sessions!: EntityTable<DriveSession, "id">;
  gpsPoints!: EntityTable<GpsPoint, "id">;
  motionChunks!: EntityTable<MotionChunk, "id">;

  constructor() {
    super("vertia");
    this.version(1).stores({
      sessions: "id, startedAt, status",
      gpsPoints: "++id, sessionId, [sessionId+t]",
      motionChunks: "++id, sessionId, [sessionId+seq]",
    });
    // weather はインデックスを張らないためストア定義は変えず、既存の記録に null を入れる
    this.version(2)
      .stores({})
      .upgrade((tx) =>
        tx
          .table<DriveSession>("sessions")
          .toCollection()
          .modify((session) => {
            session.weather = null;
          }),
      );
  }
}

export const db = new VertiaDatabase();
