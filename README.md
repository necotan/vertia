<h1 align="center">vertia</h1>

<p align="center">
  English | <a href="README.ja.md">日本語</a>
</p>

<p align="center">
  <img src="assets/vertia-icon-readme.png" width="120" alt="vertia">
</p>

<p align="center">
  A web app that displays and records speed and G-force in real time<br>
  using your smartphone's GPS and motion sensors.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black">
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white">
  <img src="https://img.shields.io/badge/Tailwind%20CSS-4-06B6D4?logo=tailwindcss&logoColor=white">
  <img src="https://img.shields.io/badge/MapLibre%20GL%20JS-6-396CB2?logo=maplibre&logoColor=white">
  <img src="https://img.shields.io/badge/Dexie.js-4-000000">
  <br>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green"></a>
  <a href="https://vertia-app.vercel.app"><img src="https://img.shields.io/badge/Demo-Vercel-000000?logo=vercel&logoColor=white"></a>
</p>

## Quick Start
Try it right away in your browser, no setup needed. Open the drive screen on a device with GPS and motion sensors (usually a smartphone).

**[vertia-app.vercel.app](https://vertia-app.vercel.app)**

## Features
The drive screen centers on a speed readout and a circular G meter, alongside average, median, and top speed and the GPS accuracy. Screen Wake Lock keeps the screen from sleeping while you drive.

You start and stop recording manually. GPS is saved at the rate the device reports (about 1Hz), and acceleration and angular velocity at 50–60Hz without downsampling. If the app is closed during a recording, it recovers the next time you open it by recomputing the stats from the saved data.

After a drive, each recording shows a map of the route and a chart of speed over time. Distance, duration, speed, and G stats appear on the same screen. You can export a recording as gzip-compressed JSON (`vertia-YYYYMMDD-HHmm.json.gz`) and import it on another device.

The map screen paints every place you have driven through across all recordings as hexagonal areas (H3).

All data is stored in the device's IndexedDB and never sent to a server. The UI is available in Japanese and English, and the theme can be light, dark, or system.

## Supported Devices

| Device | Support |
| --- | --- |
| iOS Safari | Primary |
| Android Chrome | Supported |
| PC | Viewing recordings |

Whether the drive screen is available depends on the sensor APIs, not on screen width. A PC with GPS and motion sensors can open the drive screen too, but most PCs lack these sensors, so they are for viewing imported recordings.

## Usage

### Add to Home Screen
On a smartphone, adding the app to your home screen hides the address bar and other browser UI, so you can use it like a native app.

- **iOS (Safari)**: Tap the Share button, then "Add to Home Screen"
- **Android (Chrome)**: Open the menu, then "Add to Home screen"

### Location Settings
The drive screen uses your location. If speed or GPS accuracy doesn't display correctly, check the following settings.

- **iOS**: In Settings → Privacy & Security → Location Services → Safari Websites, turn on "Precise Location"
- **Android**: In Chrome's location permission, turn on "Use precise location"

## Development
No server or database is needed. It runs on the Next.js development server.

### Prerequisites
- Node.js 24.22.3 or later (24.x)
- To try the drive screen on a real device, an environment that can serve over HTTPS (such as a Vercel Preview)

### Steps

1. Clone the repository
   ```bash
   git clone https://github.com/necotan/vertia.git
   cd vertia
   ```
2. Install dependencies
   ```bash
   npm install
   ```
3. Start the development server
   ```bash
   npm run dev
   ```
   Before starting, the MapLibre Worker is copied to `public/maplibre/` automatically.
4. Open `http://localhost:3000` in your browser.

### Notes
- Location and motion sensors only work over HTTPS or on localhost. On a real smartphone, open the app with an HTTPS URL.
- iOS can only show the motion sensor permission dialog during a tap. That's why permission is requested when you press the "Start measuring" button.
- The Service Worker is only registered in production builds (`npm run build` then `npm run start`).

### Git Hooks (for committing changes)
If you plan to commit, enable the hooks in `.githooks/` once per clone:
```bash
git config core.hooksPath .githooks
```
`pre-commit` runs `npm run lint` and `npm run typecheck`, and `commit-msg` checks the format of the first line. This is not needed just to run the app.

### npm Scripts

| Command | Action |
| --- | --- |
| `npm run dev` | Start the development server (runs `copy:maplibre-worker` first) |
| `npm run build` | Production build (runs `copy:maplibre-worker` first) |
| `npm run start` | Start the built app |
| `npm run lint` | Run ESLint, then check that the Service Worker page list matches `app/` |
| `npm run typecheck` | Type check (also checks that `ja.json` and `en.json` have the same keys) |
| `npm run copy:maplibre-worker` | Copy the MapLibre Worker to `public/maplibre/` |
| `npm run generate:icons` | Generate favicons, Apple icons, and PWA icons from `assets/vertia-icon.png` |
| `npm run generate:boundaries -- <.shp> <.csv>` | Generate the municipality and prefecture boundaries for the map screen in `public/boundaries/` from the National Land Numerical Information administrative area data |

### Directory Structure

```
app/                  Pages (App Router), manifest, icons
components/
  drive/              Drive screen
  home/               Home
  sessions/           Recording list, details, map, speed chart
  map/                Map
  settings/           Settings
  layout/             Bottom nav, providers
  pwa/                Service Worker registration
  ui/                 Buttons, confirmation dialog
lib/
  db/                 IndexedDB schema, saving and deleting recordings, export / import
  drive/              Drive screen control, recording, stats, G calculation
  drive/renderer/     Canvas rendering
  sensors/            Location, motion sensors, Wake Lock
  i18n/               Language settings
  exploredCells.ts    Computes the H3 cells passed through from a route
  regions.ts          Finds the municipality and prefecture at the map center and computes exploration rates
  mapLibre.ts         Loading MapLibre and shared map logic
  fonts.ts            Font definitions
  format.ts           Elapsed time formatting
  geo.ts              Distance between two points, m/s to km/h conversion
messages/             Translations (ja.json / en.json)
scripts/              Icon and boundary data generation, MapLibre Worker copy, route check
public/               Service Worker, PWA icons, municipality and prefecture boundaries (boundaries/)
```

### About the MapLibre Worker
Turbopack can't resolve the Worker URL of MapLibre GL JS v6. So the Worker and its shared chunk are copied to `public/maplibre/` and served from there, and that URL is passed to `setWorkerUrl`. `public/maplibre/` is in `.gitignore`.

### Updating the Icons
Replace `assets/vertia-icon.png` and run `npm run generate:icons` to regenerate the following files with a white background.

- `app/favicon.ico`, `app/icon.png`, `app/apple-icon.png`
- `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`

### Updating the Boundary Data
The municipality and prefecture boundaries on the map screen are generated from the [National Land Numerical Information administrative area data](https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2025.html) (N03). English names come from Japan Post's [postal code data (romanized)](https://www.post.japanpost.jp/service/search/zipcode/download/roman-zip.html). To update after municipal mergers and similar changes, download and extract the nationwide N03 data (zip, about 600MB) and `KEN_ALL_ROME.zip`, then run the script with the paths to the `.shp` and `.CSV` files.

```bash
npm run generate:boundaries -- path/to/N03-20250101.shp path/to/KEN_ALL_ROME.CSV
```

If any municipality has no English name, the script lists them and stops. Add them to `ENGLISH_NAME_OVERRIDES` in `scripts/generateBoundaries.mjs`.

This regenerates the per-municipality and per-prefecture boundaries (`public/boundaries/municipality/`, `prefecture/`) and the list of names, extents, and cell counts (`index.json`). Regenerate them also when you change `CELL_RESOLUTION` in `lib/exploredCells.ts`.

## Tech Stack & Credits
This project uses the following technologies and open-source libraries.

- **Framework**: [Next.js](https://nextjs.org/) (App Router) / [React](https://react.dev/) / [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) (v4) 
- **Rendering**: Canvas API
- **Storage**: IndexedDB / [Dexie.js](https://dexie.org/)
- **Map**: [MapLibre GL JS](https://maplibre.org/) / [OpenFreeMap](https://openfreemap.org/)
- **Hexagonal Grid**: [h3-js](https://github.com/uber/h3-js) (Licensed under Apache-2.0)
- **Charts**: [Recharts](https://recharts.org/)
- **i18n & Theme**: [next-intl](https://next-intl.dev/) / [next-themes](https://github.com/pacocoursey/next-themes)
- **Icons**: [Lucide React](https://lucide.dev/) (Licensed under ISC)
- **Hosting**: [Vercel](https://vercel.com/)

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, tiles by OpenFreeMap / [OpenMapTiles](https://openmaptiles.org/). Attribution is also shown on the map.

The municipality and prefecture boundaries are created by processing the "[National Land Numerical Information (Administrative Area Data)](https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2025.html)" (Ministry of Land, Infrastructure, Transport and Tourism, CC BY 4.0). They are simplified with [mapshaper](https://github.com/mbloch/mapshaper). English names are based on Japan Post's postal code data (romanized).

## Disclaimer

**1. Use While Driving**
Drivers must not watch or operate the screen while driving. Start and stop recordings while stopped, and mount the smartphone where it doesn't block your view or interfere with driving. The developer accepts no liability for any accident or traffic violation that occurs while using this app.

**2. Accuracy of Measurements**
Displayed values such as speed, G-force, and distance are estimates calculated from the smartphone's GPS and sensors. They contain errors that depend on device performance, signal conditions, and how the device is mounted. Do not use them in place of the vehicle's speedometer or measuring instruments.

**3. Data Handling and Privacy**
Drive logs (including location data) are stored only in the device's IndexedDB and are not sent to the developer's servers. However, when displaying a map, the browser fetches map tiles for the visible area from OpenFreeMap. Exported files contain the location data of your routes, so be careful when sharing them.

**4. Data Loss**
This software is a personal project. Recordings may be lost if browser site data is cleared, if you change devices, or due to unexpected bugs. Back up recordings you want to keep with the export feature.

**5. Supported Environments**
iOS Safari is the primary target and Android Chrome is supported, but the app is not guaranteed to work on every device or OS.

**6. Disclaimer and Limitation of Liability**
This software is provided "as is". The developer accepts no liability for any damages (including financial loss or emotional distress) arising from installing or using this app, or from loss of data. Use it at your own risk.

**7. Changes in External Services**
Updates or specification changes in the technologies used (Next.js, MapLibre GL JS, OpenFreeMap, etc.) or changes to browser sensor APIs may make some features unavailable without notice. The developer has no obligation to provide ongoing maintenance or updates for such changes.

## License
The source code of this project is released under the [MIT License](LICENSE). You may use it freely, commercially or non-commercially, within the terms of the license.
