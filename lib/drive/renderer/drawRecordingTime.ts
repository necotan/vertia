import { topBarFontSize } from "./drawGpsAccuracy";
import { COLORS, NUMBER_FONT, type Rect } from "./types";

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mmss = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return h > 0 ? `${h}:${mmss}` : mmss;
}

export function drawRecordingTime(ctx: CanvasRenderingContext2D, rect: Rect, elapsedMs: number | null): void {
  if (elapsedMs === null || rect.w <= 0 || rect.h <= 0) return;

  const size = topBarFontSize(rect);
  const cy = rect.y + rect.h / 2;
  const dotR = size * 0.3;
  const left = rect.x + size * 0.6;

  ctx.fillStyle = COLORS.recording;
  ctx.beginPath();
  ctx.arc(left + dotR, cy, dotR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = COLORS.text;
  ctx.font = `600 ${size}px ${NUMBER_FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(formatElapsed(elapsedMs), left + dotR * 2 + size * 0.4, cy);
}
