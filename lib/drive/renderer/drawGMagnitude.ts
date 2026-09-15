import type { GForce } from "../gForce";
import { topBarFontSize } from "./drawGpsAccuracy";
import { COLORS, LABEL_FONT, NUMBER_FONT, type DriveLabels, type Rect } from "./types";

export function drawGMagnitude(ctx: CanvasRenderingContext2D, rect: Rect, g: GForce | null, labels: DriveLabels): void {
  if (rect.w <= 0 || rect.h <= 0) return;

  const size = topBarFontSize(rect);
  const cy = rect.y + rect.h / 2 + size * 1.4;
  const right = rect.x + rect.w;
  const color = g ? COLORS.text : COLORS.placeholder;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  // 等幅フォントのスペースで数字と単位が離れないよう、単位は別に描いて間隔を詰める
  ctx.fillStyle = g ? COLORS.subText : COLORS.placeholder;
  ctx.font = `${size}px ${LABEL_FONT}`;
  ctx.fillText(labels.gUnit, right, cy);
  const unitWidth = ctx.measureText(labels.gUnit).width;

  const value = g ? Math.hypot(g.lateral, g.longitudinal).toFixed(2) : "0.00";
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px ${NUMBER_FONT}`;
  ctx.fillText(value, right - unitWidth - size * 0.2, cy);
}
