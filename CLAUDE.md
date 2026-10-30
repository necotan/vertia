# CLAUDE.md

## Language rules

- Respond to the user in Japanese.
- Commit messages: first line in English, all following lines in Japanese.
- Write code comments in Japanese.
- Use English for variable names, function names, file names, and translation keys.
- Write `messages/ja.json` values in Japanese and `messages/en.json` values in English.

## Project

Vertia: a PWA showing real-time speed and G-force from a mounted smartphone, with session recording and review.

The specs are the source of truth for what to build; read the relevant section before implementing. This file covers how to work.

- `docs/requirements.md`: screens, sensors, offline behavior, non-functional requirements, open questions. Read it when changing what a screen or sensor does.
- `docs/data-model.md`: IndexedDB schema, session file, weather data, localStorage keys, and how to change them. Read it before touching `lib/db/`, export/import, or stored settings.

## Commands

- `npm run dev`: dev server (`predev` copies the MapLibre worker to `public/maplibre/`)
- `npm run build` / `npm run start`: production build and serve. The Service Worker is registered only in production builds.
- `npm run lint`: ESLint
- `npx tsc --noEmit`: type check (no npm script)
- `npm run generate:icons`: regenerate all icons from `assets/vertia-icon.png`
- There is no test suite.

## After every change

- Run `npm run lint` and `npx tsc --noEmit`.
- If `messages/` changed, confirm `ja.json` and `en.json` have the same keys. `tsc` checks keys only against `ja.json` (`global.d.ts`).

## Layout

- `app/`: routes only; each page renders a screen from `components/<screen>/`. Shared UI: `components/ui/`.
- `lib/db/`: Dexie schema, repository, export/import. `lib/drive/`: controller, recorder, stats, G-force; `renderer/` draws the Canvas.
- `public/sw.js`: hand-written Service Worker. Add any new page route to its `PAGES` list.
- `public/maplibre/`: generated and git-ignored. Do not edit.
- `docs/`: only the two specs are tracked; anything else there is git-ignored local notes. When behavior or a stored format changes, update the spec in the same change.

## Rules

### Stack

- Ask first before adding a dependency or replacing any part of the stack (`package.json`, requirements §4).

### Drive screen

- MUST draw speed and G-force directly on the Canvas (`DriveRenderer`, `requestAnimationFrame`). NEVER route them through React state: GPS (~1 Hz) and motion (50–60 Hz) updates would re-render constantly. React receives only `DriveUiState`.
- The Canvas palette follows the app theme via `setDrivePalette` in `lib/drive/renderer/types.ts`.

### Data and network

- NEVER add cloud sync, a server-side database, or authentication. All data stays in IndexedDB.
- External requests are limited to OpenFreeMap (map) and Open-Meteo (weather). NEVER send session data. Weather requests send only coordinates rounded to 2 decimal places (~1 km, `roundCoord` in `lib/weather/openMeteo.ts`).
- Recording starts and stops manually only. Do not add automatic detection.
- Keep `/sessions/detail?id=` a single static page. Do not convert it to a dynamic route; the Service Worker precaches it for offline use.

### Device support

- Decide whether drive features are available by feature detection (`lib/sensors/capabilities.ts`, then `waitForMotionData`). NEVER by screen width.
- iOS Safari is primary; Android Chrome is secondary. Geolocation, DeviceMotionEvent, and Wake Lock behave differently across browsers; handle missing APIs and denied permissions.
- iOS allows `DeviceMotionEvent.requestPermission()` only during a user gesture. Call `requestMotionPermission()` synchronously at the start of the tap handler, before any `await`.

### i18n

- NEVER hard-code UI text in JSX or Canvas drawing. Use translation keys; pass Canvas text through `DriveLabels`.
- MUST add every new key to both `messages/ja.json` and `messages/en.json` in the same change.
- Nest keys as `page.section.element` (e.g. `sessions.detail.export.button`). Shared text goes in `common`, `nav`, `units`, `weather`, `languageOptions`.
- Use `useTranslations("<namespace>")` and ICU `{name}` placeholders.
- Load and save the locale only through `lib/i18n/config.ts` and `lib/i18n/I18nProvider.tsx` (client-side, no locale routing).

### Comments

- Write only why: the reason for a choice, workarounds for browser or library quirks (iOS Safari, MapLibre, Dexie, etc.), and constraints the code alone does not show.
- Do not write what the code, names, or JSX already say (e.g. "ハンバーガーメニュー", "保存ボタン", "〜の処理"). If there is no why to explain, write no comment.
- No decorative characters such as `---`, `===`, `***`.

## Commit messages

| Prefix | Use |
|---|---|
| fix | Bug fix |
| hotfix | Critical bug fix |
| add | New file or feature |
| update | Feature change (not a bug) |
| change | Spec change |
| clean | Cleanup, refactoring |
| disable | Disable, comment out |
| remove | Remove a file or feature |
| upgrade | Version upgrade |
| revert | Revert a change |

- Line 1: `<prefix>: <summary in English>`.
- The body is optional. For a small change that line 1 fully describes, write line 1 only. Otherwise add a blank line and 1 to about 4 Japanese bullets; do not pad to reach 4.
- Bullets name the concrete files, components, or storage keys changed and how. Do not explain causes or background unless the user asks.

```
update: enlarge region name on explored map
```

```
update: open explored map at last position or latest drive's prefecture

- lib/exploredMapView.ts を追加し、地図の中心と縮尺を vertia.exploredMapView に保存、復元
- 保存位置がない場合は最新セッションのセルとその県の陸地の範囲に合わせて表示する
- lib/regions.ts に地点を含む陸地だけの範囲を返す regionPartBoundsAt を追加
- requirements.md 7.6 と data-model.md §4 に初期表示と localStorage キーを追記
```

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
