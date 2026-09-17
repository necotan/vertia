import type { GForce } from "../gForce";
import { COLORS, NUMBER_FONT, type Circle } from "./types";

export const G_METER_FULL_SCALE = 1.5;
const RING_STEP_G = 0.5;

// ドットは車内の物体が受ける慣性力の向きに動く（減速で上、加速で下、右旋回で左）
export function drawGMeter(ctx: CanvasRenderingContext2D, circle: Circle, g: GForce | null): void {
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

  for (let i = 1; i <= ringCount; i++) {
    const ringG = RING_STEP_G * i;
    const ringR = r * (ringG / G_METER_FULL_SCALE);
    const isOuter = i === ringCount;

    ctx.strokeStyle = isOuter ? COLORS.ringOuter : COLORS.ring;
    ctx.lineWidth = isOuter ? Math.max(1.5, r * 0.012) : Math.max(1, r * 0.008);
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.fillStyle = COLORS.subText;
    ctx.fillText(ringG.toFixed(1), cx + ringR - tickSize * 0.3, cy + tickSize * 0.3);
  }

  if (!g) return;

  let dx = -g.lateral / G_METER_FULL_SCALE;
  let dy = g.longitudinal / G_METER_FULL_SCALE;
  const len = Math.hypot(dx, dy);
  if (len > 1) {
    dx /= len;
    dy /= len;
  }

  ctx.fillStyle = COLORS.dot;
  ctx.beginPath();
  ctx.arc(cx + dx * r, cy + dy * r, Math.max(6, r * 0.07), 0, Math.PI * 2);
  ctx.fill();
}
