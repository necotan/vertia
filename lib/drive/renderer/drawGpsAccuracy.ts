import { COLORS, LABEL_FONT, NUMBER_FONT, type DriveFrame, type DriveLabels, type Rect } from "./types";

export function topBarFontSize(rect: Rect): number {
  return Math.max(12, Math.min(16, rect.h * 0.34));
}

export function drawGpsAccuracy(ctx: CanvasRenderingContext2D, rect: Rect, frame: DriveFrame, labels: DriveLabels): void {
  if (rect.w <= 0 || rect.h <= 0) return;

  const size = topBarFontSize(rect);
  const cy = rect.y + rect.h / 2;
  const right = rect.x + rect.w;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  if (frame.gpsAccuracyM === null) {
    ctx.fillStyle = COLORS.subText;
    ctx.font = `${size}px ${LABEL_FONT}`;
    ctx.fillText(labels.gpsWaiting, right, cy);
    return;
  }

  // 等幅フォントではスペースも数字1文字分の幅になり数字と単位が離れるため、単位は別に描いて間隔を詰める
  const unit = "m";
  ctx.fillStyle = COLORS.text;
  ctx.font = `${size}px ${LABEL_FONT}`;
  ctx.fillText(unit, right, cy);
  const unitWidth = ctx.measureText(unit).width;

  const value = String(Math.round(frame.gpsAccuracyM));
  const valueRight = right - unitWidth - size * 0.2;
  ctx.font = `600 ${size}px ${NUMBER_FONT}`;
  ctx.fillText(value, valueRight, cy);
  const valueWidth = ctx.measureText(value).width;

  ctx.fillStyle = COLORS.subText;
  ctx.font = `${size}px ${LABEL_FONT}`;
  ctx.fillText(labels.gpsAccuracy, valueRight - valueWidth - size * 0.5, cy);
}
