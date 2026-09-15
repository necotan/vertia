import { COLORS, LABEL_FONT, NUMBER_FONT, type DriveLabels, type Rect } from "./types";

function fitNumberFontSize(ctx: CanvasRenderingContext2D, rect: Rect): number {
  const probeSize = 100;
  ctx.font = `700 ${probeSize}px ${NUMBER_FONT}`;
  const probeWidth = ctx.measureText("888").width;
  const byWidth = probeWidth > 0 ? (rect.w * 0.82 * probeSize) / probeWidth : rect.h;
  return Math.max(24, Math.min(rect.h * 0.62, byWidth));
}

export function drawSpeed(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  speedKmh: number | null,
  labels: DriveLabels,
): void {
  if (rect.w <= 0 || rect.h <= 0) return;

  const fontSize = fitNumberFontSize(ctx, rect);
  const unitSize = Math.max(12, fontSize * 0.16);

  // 数字と単位をひとまとまりとして枠の上下中央に置き、単位は数字の真下に中央揃えで描く
  const capHeight = fontSize * 0.72;
  const gap = unitSize * 0.7;
  const blockH = capHeight + gap + unitSize;
  const baseline = rect.y + (rect.h - blockH) / 2 + capHeight;
  const cx = rect.x + rect.w / 2;

  ctx.fillStyle = speedKmh === null ? COLORS.placeholder : COLORS.text;
  ctx.font = `700 ${fontSize}px ${NUMBER_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(speedKmh === null ? "0" : String(Math.min(999, Math.round(speedKmh))), cx, baseline);

  ctx.fillStyle = COLORS.subText;
  ctx.font = `${unitSize}px ${LABEL_FONT}`;
  ctx.textBaseline = "top";
  ctx.fillText(labels.speedUnit, cx, baseline + gap);
}
