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

export async function completeSession(sessionId: string, endedAt: number, summary: SessionSummary): Promise<void> {
  await db.sessions.update(sessionId, { status: "completed", endedAt, updatedAt: endedAt, summary });
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
    const [points, chunks] = await Promise.all([
      getSessionGpsPoints(session.id),
      getSessionMotionChunks(session.id),
    ]);
    const endedAt = session.updatedAt;
    const summary = computeSummaryFromData(session.startedAt, endedAt, session.calibration, points, chunks);
    await db.sessions.update(session.id, { status: "interrupted", endedAt, summary });
  }
  return stale.length;
}
