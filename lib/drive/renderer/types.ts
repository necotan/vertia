import type { GForce } from "../gForce";

// DriveController が保持し、描画ループが毎フレーム参照する
export interface DriveFrame {
  speedKmh: number | null;
  gpsAccuracyM: number | null;
  g: GForce | null;
  avgKmh: number | null;
  medianKmh: number | null;
  maxKmh: number | null;
  recordingElapsedMs: number | null;
}

export interface DriveLabels {
  speedUnit: string;
  avg: string;
  median: string;
  max: string;
  gpsAccuracy: string;
  gpsWaiting: string;
  gUnit: string;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Circle {
  cx: number;
  cy: number;
  r: number;
}

export interface DrivePalette {
  background: string;
  text: string;
  subText: string;
  placeholder: string;
  ring: string;
  ringOuter: string;
  axis: string;
  dot: string;
  recording: string;
}

const DARK_PALETTE: DrivePalette = {
  background: "#000000",
  text: "#ffffff",
  subText: "#8a8a8a",
  placeholder: "#2a2a2a",
  ring: "#3a3a3a",
  ringOuter: "#c4c4c4",
  axis: "#262626",
  dot: "#ffffff",
  recording: "#ef4444",
};

const LIGHT_PALETTE: DrivePalette = {
  background: "#ffffff",
  text: "#0a0a0a",
  subText: "#737373",
  placeholder: "#e5e5e5",
  ring: "#d4d4d4",
  ringOuter: "#4a4a4a",
  axis: "#e5e5e5",
  dot: "#0a0a0a",
  recording: "#dc2626",
};

// 描画関数が参照する配色（描画ループは毎フレーム描き直すので、setDrivePalette で差し替えるとすぐ反映される）
export const COLORS: DrivePalette = { ...DARK_PALETTE };

export function setDrivePalette(theme: "light" | "dark"): void {
  Object.assign(COLORS, theme === "dark" ? DARK_PALETTE : LIGHT_PALETTE);
}

const LABEL_FONT_FALLBACK = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif';
const NUMBER_FONT_FALLBACK = 'ui-monospace, Menlo, Consolas, "Roboto Mono", monospace';

export let LABEL_FONT = LABEL_FONT_FALLBACK;
export let NUMBER_FONT = NUMBER_FONT_FALLBACK;

// next/font が <html> に定義したフォント名を取得し、Canvas で使えるよう読み込む
// sampleText は Noto Sans JP の分割ファイルのうち必要な文字を含むものを読み込むために渡す
export async function loadCanvasFonts(sampleText: string): Promise<void> {
  const root = getComputedStyle(document.documentElement);
  const geistSans = root.getPropertyValue("--font-geist-sans").trim();
  const notoSansJP = root.getPropertyValue("--font-noto-sans-jp").trim();
  const chivoMono = root.getPropertyValue("--font-chivo-mono").trim();

  const labelFamilies = [geistSans, notoSansJP].filter((family) => family !== "");
  if (labelFamilies.length > 0) LABEL_FONT = `${labelFamilies.join(", ")}, ${LABEL_FONT_FALLBACK}`;
  if (chivoMono) NUMBER_FONT = `${chivoMono}, ${NUMBER_FONT_FALLBACK}`;

  await Promise.all([
    document.fonts.load(`16px ${LABEL_FONT}`, sampleText),
    document.fonts.load(`600 16px ${NUMBER_FONT}`, "0123456789.m"),
  ]).catch(() => undefined);
}
