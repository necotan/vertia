import type { GForce } from "../gForce";
import { G_TRAIL_DURATION_MS, type GTrailPoint } from "../gTrail";
import { COLORS, NUMBER_FONT, type Circle } from "./types";

export const G_METER_FULL_SCALE = 1.5;
const RING_STEP_G = 0.5;
const TRAIL_DOT_INTERVAL_MS = 75;
const TRAIL_MAX_OPACITY = 0.75;

// ドットは車内の物体が受ける慣性力の向きに動く（減速で上、加速で下、右旋回で左）
export function drawGMeter(
  ctx: CanvasRenderingContext2D,
  circle: Circle,
  g: GForce | null,
  trail: readonly GTrailPoint[],
): void {
  const { cx, cy, r } = circle;
  if (r <= 0) return;

  ctx.lineWidth = Math.max(1, r * 0.008);
  ctx.strokeStyle = COLORS.axis;
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx, cy + r);
  ctx.stroke();

  const ringCount = Math.round(G_METER_FULL_SCALE / RING_STEP_G);
  const tickSize = Math.max(9, r * 0.06);
  ctx.font = `${tickSize}px ${NUMBER_FONT}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  const ringSpacing = r * (RING_STEP_G / G_METER_FULL_SCALE);
  const showInnerTicks = ctx.measureText(G_METER_FULL_SCALE.toFixed(1)).width + tickSize * 0.6 <= ringSpacing;

  for (let i = 1; i <= ringCount; i++) {
    const ringG = RING_STEP_G * i;
    const ringR = r * (ringG / G_METER_FULL_SCALE);
    const isOuter = i === ringCount;

    ctx.strokeStyle = isOuter ? COLORS.ringOuter : COLORS.ring;
    ctx.lineWidth = isOuter ? Math.max(1.5, r * 0.012) : Math.max(1, r * 0.008);
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.stroke();
    
    if (!isOuter && !showInnerTicks) continue;
    ctx.fillStyle = COLORS.subText;
    ctx.fillText(ringG.toFixed(1), cx + ringR - tickSize * 0.3, cy + tickSize * 0.3);
  }

  drawAxisValues(ctx, circle, g);
  if (!g) return;

  const dotRadius = Math.max(6, r * 0.07);
  drawTrail(ctx, circle, trail, dotRadius);

  const dot = toMeterPoint(circle, g);
  ctx.fillStyle = COLORS.dot;
  ctx.beginPath();
  ctx.arc(dot.x, dot.y, dotRadius, 0, Math.PI * 2);
  ctx.fill();
}

function drawAxisValues(ctx: CanvasRenderingContext2D, circle: Circle, g: GForce | null): void {
  const { cx, cy, r } = circle;
  const size = Math.max(10, r * 0.1);
  const gap = r * 0.04;
  const lateral = g?.lateral ?? 0;
  const longitudinal = g?.longitudinal ?? 0;
  const values: { value: number; x: number; y: number; align: CanvasTextAlign; baseline: CanvasTextBaseline }[] = [
    { value: -longitudinal, x: cx, y: cy - r - gap, align: "center", baseline: "bottom" },
    { value: longitudinal, x: cx, y: cy + r + gap, align: "center", baseline: "top" },
    { value: lateral, x: cx - r - gap, y: cy, align: "right", baseline: "middle" },
    { value: -lateral, x: cx + r + gap, y: cy, align: "left", baseline: "middle" },
  ];

  ctx.font = `600 ${size}px ${NUMBER_FONT}`;
  for (const { value, x, y, align, baseline } of values) {
    const text = Math.max(0, value).toFixed(2);
    ctx.fillStyle = !g ? COLORS.placeholder : text === "0.00" ? COLORS.subText : COLORS.text;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(text, x, y);
  }
}

// 外周を超える値は外周上に張り付かせる
function toMeterPoint(circle: Circle, g: GForce): { x: number; y: number } {
  let dx = -g.lateral / G_METER_FULL_SCALE;
  let dy = g.longitudinal / G_METER_FULL_SCALE;
  const len = Math.hypot(dx, dy);
  if (len > 1) {
    dx /= len;
    dy /= len;
  }
  return { x: circle.cx + dx * circle.r, y: circle.cy + dy * circle.r };
}

// 間引く基準を絶対時刻の区切りにして、新しいサンプルが届いても既存の丸の位置が動かないようにする
// 半透明だと重なった部分だけ濃くなるため、背景色と混ぜた不透明色で塗る
function drawTrail(
  ctx: CanvasRenderingContext2D,
  circle: Circle,
  trail: readonly GTrailPoint[],
  dotRadius: number,
): void {
  if (trail.length === 0) return;
  const latestT = trail[trail.length - 1].t;

  let lastSlot = Number.NaN;
  for (const point of trail) {
    const slot = Math.floor(point.t / TRAIL_DOT_INTERVAL_MS);
    if (slot === lastSlot) continue;
    lastSlot = slot;

    const freshness = 1 - (latestT - point.t) / G_TRAIL_DURATION_MS;
    if (freshness <= 0) continue;
    const { x, y } = toMeterPoint(circle, point.g);
    ctx.fillStyle = mixHex(COLORS.background, COLORS.dot, TRAIL_MAX_OPACITY * freshness);
    ctx.beginPath();
    ctx.arc(x, y, dotRadius * (0.4 + 0.15 * freshness), 0, Math.PI * 2);
    ctx.fill();
  }
}

// パレットの色は #rrggbb 形式
function mixHex(from: string, to: string, ratio: number): string {
  const channel = (hex: string, i: number): number => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const mixed = [0, 1, 2].map((i) => Math.round(channel(from, i) + (channel(to, i) - channel(from, i)) * ratio));
  return `rgb(${mixed.join(", ")})`;
}
