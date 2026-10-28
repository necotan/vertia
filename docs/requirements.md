# Requirements Specification

This document is the source of truth for what Vertia does and why. Storage formats (IndexedDB schema, session file, weather data, local settings) are in `docs/data-model.md`. How to work in this repository (commands, coding and i18n rules) is described in `CLAUDE.md`. UI text is referenced by translation key (`messages/ja.json` / `messages/en.json`); see those files for the actual wording.

## Glossary

| Term | Code | Meaning |
|---|---|---|
| Session | `DriveSession`, store `sessions`, route `/sessions` | One recording from "start recording" to "stop recording", including its GPS points and motion chunks. Shown in the UI as `nav.sessions`. |
| Measuring | `DrivePhase` `starting` / `calibrating` / `ready` | Sensors are running and values are displayed on the drive screen, but nothing is saved. |
| Recording | `DrivePhase` `recording`, `SessionStatus` `recording` | Sensor data is being saved to a session. |
| GPS point | `GpsPoint` | One position fix stored in a session. |
| Motion chunk | `MotionChunk` | About one second of motion samples stored together as columns. |
| Summary | `SessionSummary` | Aggregated values of a session (distance, duration, speed statistics, max G). |
| Calibration | `SessionCalibration` | Gravity vector and vehicle forward direction used to convert motion data into G-force. |
| Weather | `SessionWeather` | Weather stored with a session (see 5 and `data-model.md` §3). |
| Session file | `format: "vertia-session"` | The export file of one session (see `data-model.md` §2). |
| Drive screen | `/drive`, `DriveScreen` | The screen used while driving (see 7.1). |
| Session detail screen | `/sessions/detail`, `SessionDetailScreen` | The review screen of one session (see 7.2). |

The term "drive log" is not used; use "session".

## 1. Overview

A web app (PWA) that displays speed and G-force in real time using the GPS and motion sensors (accelerometer and gyroscope) of a smartphone mounted on the dashboard or similar while driving. It includes recording and reviewing sessions.

- **App name (repository name)**: Vertia (pronounced "ヴァーティア")
- **Distribution**: PWA (Progressive Web App) only. The app will not be wrapped as a native app (Capacitor, etc.).

## 2. Usage Scenario and Legal Considerations

- The smartphone is **mounted** on the dashboard or a holder. The driver does not hold it and only glances at it momentarily.
- The app is designed for this usage. Compliance with traffic laws is the driver's responsibility (see the Disclaimer in README.md).
- Driving analysis on race circuits is also kept in view as a use case.

In-app notice: the app does not show a legal or safety notice. The only related text is `drive.startHint`, shown on the drive screen before measuring starts. Whether to add a notice is listed in 9.

## 3. Supported Devices

| Device | Support level |
|---|---|
| iOS Safari | Primary |
| Android Chrome | Secondary |
| PC (any browser) | Drive features are out of scope because the sensors are unavailable (decided by feature detection, not by screen size) |

On PC, only session review (viewing sessions imported from session files) is in scope.

Feature detection (`lib/sensors/capabilities.ts`, `DriveController`):

- Static check: secure context, `navigator.geolocation`, and `DeviceMotionEvent` must all exist.
- Runtime check: after the motion permission is granted, at least one `devicemotion` event with values must arrive within 2 s. Desktop Chrome exposes `DeviceMotionEvent` but delivers no values, so it fails here.
- Any device that passes both checks may use the drive features. Screen size is never used.
- The entry to the drive screen (`home.startDrive`, `/drive`) is shown on every device. The checks run when `drive.start` is tapped; on failure the screen shows `drive.errors.unsupported` or `drive.errors.motionUnavailable`.

## 4. Technology Stack

- **Framework**: Next.js (App Router) + React + TypeScript
- **Styling**: Tailwind CSS (with tw-animate-css for animation utilities)
- **Icons**: lucide-react
- **UI primitives**: Radix UI (dialogs)
- **Fonts**: next/font (Geist and Noto Sans JP for labels, Chivo Mono for numbers; also loaded into the Canvas)
- **Drive screen rendering**: direct Canvas API drawing (not through React re-rendering, to avoid performance degradation from high-frequency updates)
- **Screen sleep prevention**: Screen Wake Lock API
- **Local storage**: IndexedDB via Dexie.js (`dexie`, with `dexie-react-hooks` for live queries)
- **Map (session detail screen only)**: MapLibre GL JS + OpenFreeMap
  - Reason: no API key and no usage limits. Preferred over the official OSM tiles because it works better with offline caching.
- **Charts**: Recharts (speed chart on the session detail screen, monthly distance chart on the home screen)
- **Weather**: Open-Meteo
  - Reason: no API key and free for non-commercial use. Used to get the weather, temperature, and wind speed when recording starts.
- **Internationalization**: next-intl (EN/JP). Client-side only, without locale routing; the locale is decided in the browser (`lib/i18n/config.ts`, `lib/i18n/I18nProvider.tsx`).
- **Theme**: next-themes (light/dark/system)

## 5. Data Storage Policy

- Sessions are stored **only locally in IndexedDB**. There is no cloud sync, no server-side database, and no authentication.
- Viewing on other devices such as a PC is done with export/import (writing a session file and loading it manually). See `data-model.md` §2.
- Recording is started and stopped **manually only** (automatic detection by speed thresholds or similar is not adopted).
- The app communicates with exactly two external services. Session data (GPS points, motion chunks) is never sent.
  - OpenFreeMap: map styles and tiles, only on the session detail screen. Tile requests reveal the displayed area at tile precision; coordinate rounding does not apply to them.
  - Open-Meteo: weather. Only coordinates rounded to 2 decimal places (about 1 km) are sent.
- The weather, temperature, and wind speed at the start of recording are stored in the session and shown on the session detail screen. Sessions without weather are treated as having no weather.
  - The stored value is the latest weather the app holds when recording starts (fetched while measuring, at most 15 minutes earlier). If none is held yet, the first value fetched after recording starts is used. It is written once per session.
  - A weather fetch failure never stops recording.
- Sessions left in `recording` (for example, when the app is closed during recording) are recovered as `interrupted`. See 11.4.

## 6. Sensor Recording

- **GPS**: device native rate (effectively 1 Hz). `watchPosition` with `enableHighAccuracy: true`, `maximumAge: 0`, `timeout: 15000`.
- **Accelerometer**: recorded at 50–60 Hz without decimation (to keep the precision needed for circuit driving analysis).
  - Every `devicemotion` event is stored. The app does not enforce or verify the rate; the actual rate depends on the device (see 9).
  - Each sample stores `accelerationIncludingGravity`, and also `acceleration` and `rotationRate` (gyroscope) when the device provides them.
- **Speed**: the speed reported by the device. Negative or non-finite values are treated as missing; when missing, speed is computed from the distance and time to the previous GPS point.
- **Calibration**: when measuring starts (and on `drive.recalibrate`), the gravity vector is averaged over at least 1.5 s and at least 20 samples while the vehicle is stopped. If its magnitude differs from standard gravity (9.80665 m/s²) by more than 3 m/s², calibration restarts.
- **Forward direction**: until estimated, the vehicle's forward direction is assumed to be opposite to the screen normal (screen facing the driver), or the device's top edge when the device lies flat. While driving, the forward direction is estimated from the motion data and saved to the session's calibration. The estimation uses the yaw rate from `rotationRate` to detect straight driving; when the device provides no `rotationRate`, the forward direction is not estimated and the assumed direction is kept.
- **G-force**: lateral and longitudinal G are the gravity-removed acceleration projected onto the vehicle's right and forward axes, divided by standard gravity. Displayed values use a first-order low-pass filter with a 150 ms time constant; the max G values in the summary use the same filtered values.

## 7. Screen Specifications

| Route | Screen | Section |
|---|---|---|
| `/` | Home | 7.3 |
| `/drive` | Drive | 7.1 |
| `/sessions` | Sessions | 7.4 |
| `/sessions/detail?id=<sessionId>` | Session detail | 7.2 |
| `/settings` | Settings | 7.5 |

The bottom navigation (`nav.home`, `nav.sessions`, `nav.settings`) is shown on every screen except `/drive`.

### 7.1 Drive Screen

- Primary display:
  - **Circular G-meter**: G-force is shown by the dot's offset from the center. Full scale is 1.5 G with rings every 0.5 G. The dot leaves a trail of the last 1.5 s.
  - **Speed**: shown as the largest numeric text on the screen.
- Auxiliary information (drawn smaller than the speed value):
  - Average speed (`drive.canvas.avg`)
  - Median speed (`drive.canvas.median`)
  - Max speed (`drive.canvas.max`)
  - GPS accuracy (`drive.canvas.gpsAccuracy`; `drive.canvas.gpsWaiting` until the first fix)
  - Combined G magnitude (`drive.canvas.gMagnitude`)
  - Elapsed recording time (while recording only)
  - Average, median, and max speed are shown only while recording and are cleared when recording stops.
- Layout: in portrait, speed is above the G-meter; in landscape, speed and the speed statistics are on the left and the G-meter is on the right. Safe-area insets are respected.
- Flow and controls:
  - `drive.start` starts measuring: motion permission request, feature detection (see 3), then calibration (`drive.calibrating`).
  - When calibration finishes, `drive.recordStart` and `drive.recalibrate` are available.
  - While recording, `drive.recordStop` is shown (`drive.saving` while saving).
  - `drive.startHint` is shown before measuring starts.
  - The back link is hidden while recording or saving.
- Screen Wake Lock is requested when measuring starts and re-requested when the page becomes visible again. If it fails or is unsupported, `drive.wakeLock.failed` or `drive.wakeLock.unsupported` is shown, and measuring continues.
- The drive screen also **follows the app theme setting (light/dark/system)**.
  - In dark mode, pure black `#000000` is used as the background for OLED displays to optimize power consumption and visibility.
  - In light mode, the same colors as the rest of the app are used.
- Rendering: the Canvas is redrawn on every animation frame. High-frequency values are held outside React; React is notified only of coarse state changes (phase, error, wake lock status).

### 7.2 Session Detail Screen

- Header: back link, export button (`sessions.detail.export.button`), and delete button (`sessions.detail.delete.button`).
  - The export button is hidden when the browser lacks `CompressionStream` / `DecompressionStream`.
  - Delete asks for confirmation (`sessions.detail.delete.confirmTitle`, `sessions.detail.delete.confirmMessage`). It removes the session and all of its GPS points and motion chunks in one transaction, then navigates to `/sessions`.
- Title: the session's start date and time.
- Map (route): MapLibre GL JS + OpenFreeMap
  - Styles: `positron`, `bright`, `liberty`, `dark`, `fiord`, `3d` (`liberty` with a 60° pitch). When no style has been chosen, `positron` is used in light mode and `dark` in dark mode. The chosen style is saved (see `data-model.md` §4).
  - Speed-colored route (`sessions.detail.map.speedColors.toggle`, on by default): the route is colored in 10 speed bands. Palette and scale come from the settings (see 7.5).
  - Fullscreen view and cooperative gestures (`sessions.detail.map.gesture*`).
  - When offline, `sessions.detail.map.offline` is shown instead of the map. When the session has no GPS points, `sessions.detail.map.noPoints` is shown.
- Speed chart: built from GPS points with accuracy of 50 m or better, averaged down to at most 600 points.
- Weather: the weather, temperature, and wind speed at the start of recording (shown only when the session has weather).
  - Weather is shown only on the session detail screen. It is not shown on the drive screen or on session cards.
- Summary:
  - Overview: distance, duration
  - Speed: average, median, max
  - G-force: max, max lateral, max longitudinal
  - When the session has no summary yet (still recording), `sessions.detail.noSummary` is shown. When the ID is unknown, `sessions.detail.notFound` is shown.

### 7.3 Home Screen

- `home.startDrive` links to `/drive` (shown on every device, see 3).
- Statistics (`home.stats.*`), computed from sessions that have a summary:
  - Distance per month for the last 6 months (months are based on the device's local time)
  - Total distance, number of sessions, total duration
- The 3 most recent sessions (`home.recent.title`).
- When there are no sessions, the empty state (`sessions.empty.*`) is shown without the start action.

### 7.4 Sessions Screen

- All sessions, newest first by start time. Each card shows the start date and time, distance, duration, and max speed.
- Import button (`sessions.import.button`): accepts `.gz` files. On success, the imported session's detail screen opens. Failures show `sessions.import.errors.*` (see `data-model.md` §2).
- When there are no sessions, the empty state (`sessions.empty.*`) is shown with `sessions.empty.action`.

### 7.5 Settings Screen

| Setting | Options | Default |
|---|---|---|
| Language (`settings.language`) | `ja`, `en` | First match in `navigator.languages`, otherwise `ja` |
| Theme (`settings.theme`) | `system`, `light`, `dark` | `system` |
| Distance unit (`settings.distanceUnit`) | `km`, `mi` | `km` |
| Map speed colors (`settings.speedPalette`) | `blue`, `standard` | `blue` |
| Speed color scale (`settings.speedScale`) | `relative` (the session's max speed is the darkest color), `absolute` (fixed thresholds) | `relative` |

- The distance unit also switches the other units: `km` → km/h, °C, m/s for wind; `mi` → mph, °F, mph for wind. Values are stored in SI units and converted for display.
- Absolute speed thresholds: `km` 20, 40, …, 180 km/h; `mi` 10, 20, 30, 40, 50, 60, 75, 90, 110 mph.

## 8. Offline Behavior (Service Worker)

- When the Service Worker is installed, all screens (home, drive, sessions, session detail, settings) and the build assets those screens load are saved.
- The drive screen can measure and record offline.
- The session detail screen is a single static page for all sessions (`/sessions/detail?id=<sessionId>`), so any session can be viewed offline.
- Screens are fetched network-first. If there is no response within 3 seconds, the saved screen is shown (to avoid waiting when the signal is weak).
- Map tiles are not saved. When offline, a message is shown instead of the map.
- The cache is replaced on each deployment, and old caches are deleted.

Implementation details (`public/sw.js`, `components/pwa/ServiceWorkerRegister.tsx`):

- The Service Worker is registered only in production builds. Its URL carries `?v=<version>` (Vercel deployment ID, commit SHA, or build time), and the cache name is `vertia-<version>`.
- `/_next/static/` is served cache-first. Other same-origin GET requests are network-first with the cache as fallback. RSC requests are not cached.
- Pages are cached by path without the query string. If a page has no saved copy and the network fails, `/` is returned.

## 9. Open Questions

- Whether to show a legal or safety notice in the app (currently only `drive.startHint`), and its content and placement.
- Motion sampling rate: whether to verify or warn when the device delivers fewer than 50 samples per second.
- Storage capacity: upper limit, whether to request persistent storage (`navigator.storage.persist()`), and the behavior when the quota is exceeded.
- Long recordings: maximum recording duration, and whether to split or limit sessions.
- A numeric update-rate target for the drive screen.
- Whether to add circuit-specific features (such as lap timing) for the circuit use case in 2.

## 10. Data Specification

Moved to `docs/data-model.md`: 10.1 IndexedDB Schema → §1, 10.2 Session File → §2, 10.3 Weather Data → §3, 10.4 Local Settings → §4. The section number is kept so that references to 11 and later stay valid.

## 11. Non-functional Requirements

### 11.1 Sensor Permission and Support

| Situation | Behavior |
|---|---|
| Not a secure context, or no Geolocation / `DeviceMotionEvent` | Measuring does not start; `drive.errors.unsupported` |
| Motion permission denied (iOS `requestPermission()`) | Measuring does not start; `drive.errors.motionDenied` |
| No motion values within 2 s | Measuring does not start; `drive.errors.motionUnavailable` |
| Location permission denied | Recording (if any) is stopped and saved, sensors stop; `drive.errors.geolocationDenied` |
| Wake Lock unsupported or failed | Measuring continues; `drive.wakeLock.unsupported` / `drive.wakeLock.failed` |

After an error, measuring can be restarted with `drive.start`. On iOS, the motion permission request is made synchronously in the tap handler, before any other `await`.

### 11.2 GPS Failure and Poor Accuracy

- If position is unavailable before the first fix, `drive.errors.geolocationUnavailable` is shown and measuring continues; the error clears when a fix arrives.
- If no fix arrives for 5 s, the speed and GPS accuracy displays return to their placeholder state.
- GPS points with accuracy worse than 50 m are still stored, but are excluded from distance, average/median/max speed, the map route, and the speed chart. The live speed display does not apply this filter.
- Distance is not added while speed is below 0.5 m/s, so that GPS jitter while stopped does not add distance. Median speed uses only points at 5 km/h or faster.

### 11.3 Drive Screen Update Rate

- The Canvas is redrawn on every animation frame (`requestAnimationFrame`, following the display refresh rate). Speed and GPS values change when a fix arrives (about 1 Hz); G values change with each motion event.
- Numeric update-rate target: TBD.

### 11.4 Storage and Long Recordings

- During recording, buffered data is written every 1 s in one transaction, which also updates `updatedAt`. Failed writes are retried on the next write; the first failure shows `drive.errors.saveFailed` once and recording continues.
- When recording stops, data that still cannot be written causes `drive.errors.saveFailed`, and the session stays `recording` until recovered.
- Recovery: a `recording` session whose `updatedAt` is more than 10 s old is changed to `interrupted`, with `endedAt = updatedAt` and a summary recomputed from stored data. This runs when the home, sessions, or drive screen opens.
- The app does not check the storage quota or request persistent storage. Storage upper limit: TBD. Maximum recording duration: TBD.

### 11.5 Security Headers

- `Permissions-Policy` allows `geolocation`, `accelerometer`, `gyroscope`, and `screen-wake-lock` for the app's own origin only and disables camera, microphone, payment, USB, and browsing topics (`next.config.ts`).
- The sensors require HTTPS (secure context).
