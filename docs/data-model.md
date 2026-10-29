# Data Model

The storage formats of Vertia: the IndexedDB schema, the session file, stored weather data, and local settings. This file is the source of truth for their shape; what the app does with them is in `docs/requirements.md`. Update this file in the same change as any format change.

## 1. IndexedDB Schema

Database `vertia` (Dexie version 4, `lib/db/schema.ts`). Times are epoch milliseconds; physical values are SI units.

| Store | Primary key | Indexes |
|---|---|---|
| `sessions` | `id` | `startedAt`, `status` |
| `gpsPoints` | `++id` | `sessionId`, `[sessionId+t]` |
| `motionChunks` | `++id` | `sessionId`, `[sessionId+seq]` |
| `sessionCells` | `sessionId` | |

Dexie version history: 1 = initial stores; 2 = adds `weather` (existing sessions set to `null`); 3 = adds `calibration.forward` (existing sessions set to `null`); 4 = adds the `sessionCells` store (no upgrade; filled when the map screen opens).

`DriveSession` (`sessions`):

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | `crypto.randomUUID()` |
| `status` | `"recording" \| "completed" \| "interrupted"` | `recording` → `completed` on stop, or → `interrupted` on recovery (`requirements.md` §11.4) |
| `startedAt` | `number` | |
| `endedAt` | `number \| null` | `null` while recording; for interrupted sessions, the last write time |
| `updatedAt` | `number` | Last write time during recording |
| `calibration` | `SessionCalibration` | `gravity: Vec3` (m/s², device coordinates); `forward: Vec3 \| null` (unit vector, `null` until estimated) |
| `summary` | `SessionSummary \| null` | `null` while recording |
| `weather` | `SessionWeather \| null` | `null` when not fetched (see 3) |
| `schemaVersion` | `number` | `SESSION_SCHEMA_VERSION` (currently 3) at creation |

`SessionSummary`: `distanceM`, `durationMs`, `maxSpeedMps`, `avgSpeedMps`, `medianSpeedMps`, `maxG`, `maxLateralG`, `maxLongitudinalG` (all `number`). Recomputed from stored data when recording stops or a session is recovered, so the whole session uses the final forward direction.

`GpsPoint` (`gpsPoints`): `id?`, `sessionId`, `t` (position timestamp), `lat`, `lng`, `accuracy` (m), `altitude`, `altitudeAccuracy`, `speed` (m/s), `heading` — the last four are `number | null`.

`MotionChunk` (`motionChunks`): about one second of samples.

| Field | Type | Notes |
|---|---|---|
| `id?`, `sessionId`, `seq` | `number`, `string`, `number` | `seq` increases from 0 within a session |
| `t0` | `number` | Time of the first sample (`performance.timeOrigin + event.timeStamp`) |
| `dt` | `Float32Array` | Offset of each sample from `t0` (ms) |
| `ax`, `ay`, `az` | `Float32Array` | `accelerationIncludingGravity` (m/s²) |
| `lax`, `lay`, `laz` | `Float32Array \| null` | `acceleration` (m/s²) |
| `ra`, `rb`, `rg` | `Float32Array \| null` | `rotationRate` alpha/beta/gamma (deg/s) |

A nullable column is `null` when every sample lacks the value; when only some samples lack it, those entries are `NaN`. All columns in a chunk have the same length.

`SessionCells` (`sessionCells`): a cache of the H3 cells a session passed through, derived from its GPS points (`lib/exploredCells.ts`, `requirements.md` §7.6). Deleted together with its session.

| Field | Type | Notes |
|---|---|---|
| `sessionId` | `string` | |
| `resolution` | `number` | H3 resolution (currently 8) |
| `algorithmVersion` | `number` | Version of the computation (currently 1). A row whose `resolution` or `algorithmVersion` differs from the app's is recomputed. |
| `cells` | `string[]` | H3 cell IDs, without duplicates |

Changing how cells are computed needs no Dexie version: raise `CELL_ALGORITHM_VERSION` (or the resolution) in `lib/exploredCells.ts` and the rows are recomputed.

## 2. Session File (Export/Import)

- One session per file. Filename `vertia-YYYYMMDD-HHmm.json.gz` (local start time). Content: gzip-compressed JSON.
- Requires `CompressionStream` / `DecompressionStream`.
- `sessionCells` is not exported; it is recomputed from the GPS points after import.

| Field | Content |
|---|---|
| `format` | `"vertia-session"` |
| `version` | `3` (written). Versions 1–3 are accepted on import. |
| `exportedAt` | Epoch ms |
| `session` | `DriveSession` as stored |
| `gpsPoints` | `GpsPoint` without `id` and `sessionId` |
| `motionChunks` | `MotionChunk` without `id` and `sessionId`; each Float32 column is the base64 of the array's raw bytes, or `null` |

Import (`lib/db/sessionTransfer.ts`):

- The whole file is validated before anything is written, and all rows are written in one transaction. The session keeps its original `id` and `status`.
- A missing `weather` (version 1 files) or `calibration.forward` is read as `null`. A `session.schemaVersion` newer than the app's is rejected.
- Results map to `sessions.import.errors.*`: `unsupported` (no compression streams), `invalid` (not a valid session file), `duplicate` (a session with the same `id` already exists), `failed` (write error).

## 3. Weather Data

- Stored fields (`SessionWeather`): `observedAt` (observation time from the API, epoch ms), `weatherCode` (WMO code), `temperatureC`, `windSpeedMps`, `lat` / `lng` (the rounded coordinates used for the request).
- Request: `https://api.open-meteo.com/v1/forecast` with `current=temperature_2m,weather_code,wind_speed_10m`, `wind_speed_unit=ms`, `timeformat=unixtime`, and coordinates rounded to 2 decimal places.
- While measuring, the app fetches when it has no value, every 15 minutes, or after moving 10 km or more from the last fetched position. After a failure it retries after 60 s. It does not fetch while `navigator.onLine` is false. Each request times out after 8 s.
- A response with non-finite values or a negative wind speed is treated as a failure.
- Weather codes are mapped to `weather.codes.*` for display (`lib/weather/weatherCode.ts`). Unit conversion happens at display time.

## 4. Local Settings (localStorage)

| Key | Values |
|---|---|
| `vertia.locale` | `ja`, `en` |
| `vertia.distanceUnit` | `km`, `mi` |
| `vertia.mapStyle` | Map style ID (`requirements.md` §7.2) |
| `vertia.routeSpeedColors` | `on`, `off` |
| `vertia.speedPalette` | `blue`, `standard` |
| `vertia.speedScale` | `relative`, `absolute` |

The theme is stored by next-themes with its default key. Settings are per device and are not included in session files.

## 5. Changing the Data Format

Sessions already stored on devices and session files already exported must keep working. When a stored field is added or changed:

1. `lib/db/schema.ts`: add a new `this.version(n)` and leave the existing versions as they are. Change `.stores()` only when indexes change. In `.upgrade()`, give existing rows a value for the new field (versions 2 and 3 set it to `null`).
2. Increase `SESSION_SCHEMA_VERSION`; new sessions record it in `schemaVersion`.
3. `lib/db/sessionTransfer.ts`: increase `FILE_VERSION` and add it to `SUPPORTED_FILE_VERSIONS`, keeping every older version. When an older file lacks the field, read it as `null` or its default.
4. Update the version history in 1 and the `version` row in 2.

An app older than the data rejects it (`schemaVersion` or file `version` newer than it supports) instead of misreading it.
