import { Dexie } from "dexie";
import { computeSummaryFromData } from "@/lib/drive/liveStats";
import {
  db,
  SESSION_SCHEMA_VERSION,
  type DriveSession,
  type GpsPoint,
  type MotionChunk,
  type SessionCalibration,
  type SessionSummary,
  type SessionWeather,
} from "./schema";

// 記録中セッションの最終書き込みがこれより古ければ、中断されたものとみなす
const STALE_RECORDING_MS = 10_000;

export async function createSession(calibration: SessionCalibration, startedAt: number): Promise<DriveSession> {
  const session: DriveSession = {
    id: crypto.randomUUID(),
    status: "recording",
    startedAt,
    endedAt: null,
    updatedAt: startedAt,
    calibration,
    summary: null,
    weather: null,
    schemaVersion: SESSION_SCHEMA_VERSION,
  };
  await db.sessions.add(session);
  return session;
}

export async function appendSessionData(
  sessionId: string,
  gpsPoints: GpsPoint[],
  motionChunks: MotionChunk[],
  updatedAt: number,
): Promise<void> {
  await db.transaction("rw", db.sessions, db.gpsPoints, db.motionChunks, async () => {
    if (gpsPoints.length > 0) await db.gpsPoints.bulkAdd(gpsPoints);
    if (motionChunks.length > 0) await db.motionChunks.bulkAdd(motionChunks);
    await db.sessions.update(sessionId, { updatedAt });
  });
}

// 記録開始時の天気を後から書き込む
export async function setSessionWeather(sessionId: string, weather: SessionWeather): Promise<void> {
  await db.sessions.update(sessionId, { weather });
}

// 走行中に推定した前方を記録中に書き込み、中断時の復旧でも使えるようにする
export async function setSessionCalibration(sessionId: string, calibration: SessionCalibration): Promise<void> {
  await db.sessions.update(sessionId, { calibration });
}

// 記録の途中で前方の推定が変わっても全区間を同じ向きで集計するよう、サマリーは保存済みのデータから計算し直す
export async function completeSession(
  sessionId: string,
  startedAt: number,
  endedAt: number,
  calibration: SessionCalibration,
): Promise<void> {
  const summary = await computeStoredSummary(sessionId, startedAt, endedAt, calibration);
  await db.sessions.update(sessionId, { status: "completed", endedAt, updatedAt: endedAt, calibration, summary });
}

async function computeStoredSummary(
  sessionId: string,
  startedAt: number,
  endedAt: number,
  calibration: SessionCalibration,
): Promise<SessionSummary> {
  const [points, chunks] = await Promise.all([getSessionGpsPoints(sessionId), getSessionMotionChunks(sessionId)]);
  return computeSummaryFromData(startedAt, endedAt, calibration, points, chunks);
}

// セッションと紐づく時系列データをまとめて削除する
export async function deleteSession(sessionId: string): Promise<void> {
  await db.transaction("rw", db.sessions, db.gpsPoints, db.motionChunks, async () => {
    await db.gpsPoints.where("sessionId").equals(sessionId).delete();
    await db.motionChunks.where("sessionId").equals(sessionId).delete();
    await db.sessions.delete(sessionId);
  });
}

export async function getSessionGpsPoints(sessionId: string): Promise<GpsPoint[]> {
  return db.gpsPoints.where("[sessionId+t]").between([sessionId, Dexie.minKey], [sessionId, Dexie.maxKey]).toArray();
}

export async function getSessionMotionChunks(sessionId: string): Promise<MotionChunk[]> {
  return db.motionChunks
    .where("[sessionId+seq]")
    .between([sessionId, Dexie.minKey], [sessionId, Dexie.maxKey])
    .toArray();
}

// アプリ終了等で recording のまま残ったセッションを interrupted にしてサマリーを作る
export async function recoverInterruptedSessions(now: number = Date.now()): Promise<number> {
  const stale = await db.sessions
    .where("status")
    .equals("recording")
    .filter((s) => now - s.updatedAt > STALE_RECORDING_MS)
    .toArray();

  for (const session of stale) {
    const endedAt = session.updatedAt;
    const summary = await computeStoredSummary(session.id, session.startedAt, endedAt, session.calibration);
    await db.sessions.update(session.id, { status: "interrupted", endedAt, summary });
  }
  return stale.length;
}
