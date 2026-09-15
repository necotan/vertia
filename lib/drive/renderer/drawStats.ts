import { COLORS, LABEL_FONT, NUMBER_FONT, type DriveFrame, type DriveLabels, type Rect } from "./types";

export function drawStats(ctx: CanvasRenderingContext2D, rect: Rect, frame: DriveFrame, labels: DriveLabels): void {
  if (rect.w <= 0 || rect.h <= 0) return;

  const items: { label: string; value: number | null }[] = [
    { label: labels.avg, value: frame.avgKmh },
    { label: labels.median, value: frame.medianKmh },
    { label: labels.max, value: frame.maxKmh },
  ];

  const colW = rect.w / items.length;
  const labelSize = Math.max(10, rect.h * 0.22);
  const valueSize = Math.max(14, rect.h * 0.42);

  items.forEach((item, i) => {
    const cx = rect.x + colW * i + colW / 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = COLORS.subText;
    ctx.font = `${labelSize}px ${LABEL_FONT}`;
    ctx.fillText(item.label, cx, rect.y, colW * 0.95);

    // 数字の下端を枠の下端に揃える
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = item.value === null ? COLORS.placeholder : COLORS.text;
    ctx.font = `600 ${valueSize}px ${NUMBER_FONT}`;
    ctx.fillText(item.value === null ? "0" : String(Math.round(item.value)), cx, rect.y + rect.h, colW * 0.95);
  });
}
