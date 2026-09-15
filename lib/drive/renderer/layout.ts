import type { Circle, Rect } from "./types";

export interface DriveLayout {
  top: Rect;
  speed: Rect;
  gMeter: Circle;
  stats: Rect;
  hint: Rect;
}

function hintBelow(stats: Rect, width: number, height: number): Rect {
  const y = stats.y + stats.h;
  return { x: 0, y, w: width, h: Math.max(0, height - y) };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const G_METER_SIZE_RATIO = 0.85;

export const TOP_BAR_Y = 40;
export const TOP_BAR_H = 44;

export const HINT_AREA_H = 60;

export function computeLayout(width: number, height: number): DriveLayout {
  const shortSide = Math.min(width, height);
  const pad = clamp(shortSide * 0.04, 8, 32);
  const top: Rect = { x: pad, y: TOP_BAR_Y, w: width - pad * 2, h: TOP_BAR_H };

  const statsH = clamp(shortSide * 0.14, 52, 110);
  const stats: Rect = { x: pad, y: height - statsH - HINT_AREA_H, w: width - pad * 2, h: statsH };

  const bodyTop = top.y + top.h + pad;
  const bodyH = Math.max(0, stats.y - pad - bodyTop);
  const bodyW = width - pad * 2;

  if (width > height) {
    const halfW = (bodyW - pad) / 2;
    const speed: Rect = { x: pad, y: bodyTop, w: halfW, h: bodyH };
    const r = Math.max(0, (Math.min(halfW, bodyH) / 2) * G_METER_SIZE_RATIO);
    const gMeter: Circle = { cx: pad + halfW + pad + halfW / 2, cy: bodyTop + bodyH / 2, r };
    return { top, speed, gMeter, stats, hint: hintBelow(stats, width, height) };
  }

  const bottomSpace = clamp(shortSide * 0.08, 24, 64);
  const portraitBodyH = Math.max(0, bodyH - bottomSpace);
  const speedH = portraitBodyH * 0.38;
  const speed: Rect = { x: pad, y: bodyTop, w: bodyW, h: speedH };
  const meterTop = bodyTop + speedH + pad;
  const meterH = Math.max(0, portraitBodyH - speedH - pad);
  const r = Math.max(0, (Math.min(bodyW, meterH) / 2) * G_METER_SIZE_RATIO);
  const lift = clamp(shortSide * 0.04, 12, 32);
  const statsLift = lift + clamp(shortSide * 0.04, 12, 32);
  const gMeter: Circle = { cx: width / 2, cy: meterTop + meterH / 2 - lift, r };
  const liftedStats: Rect = { ...stats, y: stats.y - statsLift };
  return { top, speed, gMeter, stats: liftedStats, hint: hintBelow(liftedStats, width, height) };
}
