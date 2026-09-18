import { getSessionGpsPoints, getSessionMotionChunks } from "./sessionRepository";
import {
  db,
  SESSION_SCHEMA_VERSION,
  type DriveSession,
  type GpsPoint,
  type MotionChunk,
  type SessionStatus,
  type SessionSummary,
  type SessionWeather,
  type Vec3,
} from "./schema";

const FILE_FORMAT = "vertia-session";
const FILE_VERSION = 2;
const SUPPORTED_FILE_VERSIONS: readonly number[] = [1, 2];

interface EncodedMotionChunk {
  seq: number;
  t0: number;
  dt: string;
  ax: string;
  ay: string;
  az: string;
  lax: string | null;
  lay: string | null;
  laz: string | null;
  ra: string | null;
  rb: string | null;
  rg: string | null;
}

interface SessionFile {
  format: typeof FILE_FORMAT;
  version: typeof FILE_VERSION;
  exportedAt: number;
  session: DriveSession;
  gpsPoints: Omit<GpsPoint, "id" | "sessionId">[];
  motionChunks: EncodedMotionChunk[];
}

export type ImportResult =
  | { ok: true; sessionId: string }
  | { ok: false; reason: "unsupported" | "invalid" | "duplicate" | "failed" };

export function isTransferSupported(): boolean {
  return typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";
}

export async function exportSessionFile(sessionId: string): Promise<{ blob: Blob; filename: string }> {
  const session = await db.sessions.get(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  const [points, chunks] = await Promise.all([getSessionGpsPoints(sessionId), getSessionMotionChunks(sessionId)]);

  const file: SessionFile = {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    exportedAt: Date.now(),
    session,
    // id は取り込み先で振り直し、sessionId は session.id と同じなので書き出さない
    gpsPoints: points.map((point) => ({
      t: point.t,
      lat: point.lat,
      lng: point.lng,
      accuracy: point.accuracy,
      altitude: point.altitude,
      altitudeAccuracy: point.altitudeAccuracy,
      speed: point.speed,
      heading: point.heading,
    })),
    motionChunks: chunks.map((chunk) => ({
      seq: chunk.seq,
      t0: chunk.t0,
      dt: encodeFloat32(chunk.dt),
      ax: encodeFloat32(chunk.ax),
      ay: encodeFloat32(chunk.ay),
      az: encodeFloat32(chunk.az),
      lax: chunk.lax && encodeFloat32(chunk.lax),
      lay: chunk.lay && encodeFloat32(chunk.lay),
      laz: chunk.laz && encodeFloat32(chunk.laz),
      ra: chunk.ra && encodeFloat32(chunk.ra),
      rb: chunk.rb && encodeFloat32(chunk.rb),
      rg: chunk.rg && encodeFloat32(chunk.rg),
    })),
  };

  const json = new Blob([JSON.stringify(file)], { type: "application/json" });
  const blob = await new Response(json.stream().pipeThrough(new CompressionStream("gzip"))).blob();
  return { blob: new Blob([blob], { type: "application/gzip" }), filename: `vertia-${formatFileDate(session.startedAt)}.json.gz` };
}

export async function importSessionFile(file: File): Promise<ImportResult> {
  if (!isTransferSupported()) return { ok: false, reason: "unsupported" };

  let parsed: unknown;
  try {
    const text = await new Response(file.stream().pipeThrough(new DecompressionStream("gzip"))).text();
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "invalid" };
  }

  const data = parseSessionFile(parsed);
  if (!data) return { ok: false, reason: "invalid" };
  const { session, gpsPoints, motionChunks } = data;

  try {
    const duplicate = await db.transaction("rw", db.sessions, db.gpsPoints, db.motionChunks, async () => {
      if (await db.sessions.get(session.id)) return true;
      await db.sessions.add(session);
      if (gpsPoints.length > 0) await db.gpsPoints.bulkAdd(gpsPoints);
      if (motionChunks.length > 0) await db.motionChunks.bulkAdd(motionChunks);
      return false;
    });
    return duplicate ? { ok: false, reason: "duplicate" } : { ok: true, sessionId: session.id };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

function formatFileDate(time: number): string {
  const d = new Date(time);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function encodeFloat32(values: Float32Array): string {
  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
  let binary = "";
  // 引数の数の上限を超えないよう、区切って文字列にする
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

function decodeFloat32(value: unknown): Float32Array | null {
  if (typeof value !== "string") return null;
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    return null;
  }
  if (binary.length % 4 !== 0) return null;
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isNullableNumber = (value: unknown): value is number | null => value === null || isNumber(value);

const SESSION_STATUSES: readonly SessionStatus[] = ["recording", "completed", "interrupted"];
const SUMMARY_KEYS = [
  "distanceM",
  "durationMs",
  "maxSpeedMps",
  "avgSpeedMps",
  "medianSpeedMps",
  "maxG",
  "maxLateralG",
  "maxLongitudinalG",
] as const satisfies readonly (keyof SessionSummary)[];
const WEATHER_KEYS = [
  "observedAt",
  "weatherCode",
  "temperatureC",
  "windSpeedMps",
  "lat",
  "lng",
] as const satisfies readonly (keyof SessionWeather)[];

function parseSessionFile(
  value: unknown,
): { session: DriveSession; gpsPoints: GpsPoint[]; motionChunks: MotionChunk[] } | null {
  if (!isObject(value) || value.format !== FILE_FORMAT) return null;
  if (!isNumber(value.version) || !SUPPORTED_FILE_VERSIONS.includes(value.version)) return null;
  const session = parseSession(value.session);
  if (!session || !Array.isArray(value.gpsPoints) || !Array.isArray(value.motionChunks)) return null;

  const gpsPoints: GpsPoint[] = [];
  for (const item of value.gpsPoints) {
    const point = parseGpsPoint(item, session.id);
    if (!point) return null;
    gpsPoints.push(point);
  }
  const motionChunks: MotionChunk[] = [];
  for (const item of value.motionChunks) {
    const chunk = parseMotionChunk(item, session.id);
    if (!chunk) return null;
    motionChunks.push(chunk);
  }
  return { session, gpsPoints, motionChunks };
}

function parseSession(value: unknown): DriveSession | null {
  if (!isObject(value)) return null;
  const { id, status, startedAt, endedAt, updatedAt, calibration, summary, weather, schemaVersion } = value;
  if (typeof id !== "string" || id === "") return null;
  const knownStatus = SESSION_STATUSES.find((s) => s === status);
  if (!knownStatus) return null;
  if (!isNumber(startedAt) || !isNullableNumber(endedAt) || !isNumber(updatedAt)) return null;
  if (!isNumber(schemaVersion) || schemaVersion > SESSION_SCHEMA_VERSION) return null;

  if (!isObject(calibration) || !Array.isArray(calibration.gravity)) return null;
  const gravity = calibration.gravity;
  if (gravity.length !== 3 || !gravity.every(isNumber)) return null;
  const vec: Vec3 = [gravity[0], gravity[1], gravity[2]];

  let parsedSummary: SessionSummary | null = null;
  if (summary !== null) {
    if (!isObject(summary)) return null;
    const values = SUMMARY_KEYS.map((key) => summary[key]);
    if (!values.every(isNumber)) return null;
    parsedSummary = Object.fromEntries(SUMMARY_KEYS.map((key, i) => [key, values[i]])) as Record<
      (typeof SUMMARY_KEYS)[number],
      number
    >;
  }

  const parsedWeather = parseWeather(weather);
  if (parsedWeather === undefined) return null;

  return {
    id,
    status: knownStatus,
    startedAt,
    endedAt,
    updatedAt,
    calibration: { gravity: vec },
    summary: parsedSummary,
    weather: parsedWeather,
    schemaVersion,
  };
}

// 値が壊れている場合だけ undefined を返す（天気を持たない version 1 のファイルは null になる）
function parseWeather(value: unknown): SessionWeather | null | undefined {
  if (value === null || value === undefined) return null;
  if (!isObject(value)) return undefined;
  const values = WEATHER_KEYS.map((key) => value[key]);
  if (!values.every(isNumber)) return undefined;
  return Object.fromEntries(WEATHER_KEYS.map((key, i) => [key, values[i]])) as Record<
    (typeof WEATHER_KEYS)[number],
    number
  >;
}

function parseGpsPoint(value: unknown, sessionId: string): GpsPoint | null {
  if (!isObject(value)) return null;
  const { t, lat, lng, accuracy, altitude, altitudeAccuracy, speed, heading } = value;
  if (!isNumber(t) || !isNumber(lat) || !isNumber(lng) || !isNumber(accuracy)) return null;
  if (
    !isNullableNumber(altitude) ||
    !isNullableNumber(altitudeAccuracy) ||
    !isNullableNumber(speed) ||
    !isNullableNumber(heading)
  ) {
    return null;
  }
  return { sessionId, t, lat, lng, accuracy, altitude, altitudeAccuracy, speed, heading };
}

function parseMotionChunk(value: unknown, sessionId: string): MotionChunk | null {
  if (!isObject(value) || !isNumber(value.seq) || !isNumber(value.t0)) return null;
  const dt = decodeFloat32(value.dt);
  const ax = decodeFloat32(value.ax);
  const ay = decodeFloat32(value.ay);
  const az = decodeFloat32(value.az);
  if (!dt || !ax || !ay || !az) return null;

  const optional = (field: unknown): Float32Array | null | undefined =>
    field === null ? null : (decodeFloat32(field) ?? undefined);
  const lax = optional(value.lax);
  const lay = optional(value.lay);
  const laz = optional(value.laz);
  const ra = optional(value.ra);
  const rb = optional(value.rb);
  const rg = optional(value.rg);
  if (lax === undefined || lay === undefined || laz === undefined || ra === undefined || rb === undefined || rg === undefined) {
    return null;
  }

  // すべての列が同じ件数であることを確かめる
  const length = dt.length;
  const columns = [ax, ay, az, lax, lay, laz, ra, rb, rg];
  if (columns.some((column) => column !== null && column.length !== length)) return null;

  return { sessionId, seq: value.seq, t0: value.t0, dt, ax, ay, az, lax, lay, laz, ra, rb, rg };
}
