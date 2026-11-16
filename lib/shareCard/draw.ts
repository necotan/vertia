import { layoutShareCard, type ShareCardContent, type ShareCardLayout, type ShareCardOp } from "./layout";
import type { ShareCardBlock, ShareCardOptions } from "./options";

// 線と点の大きさは unit の倍数
const ROUTE_LINE_WIDTH = 0.8;
const START_RADIUS = 1.2;
const END_RADIUS = 1.4;
const END_RING_WIDTH = 0.5;
const END_DOT_RADIUS = 0.5;

function drawRoute(ctx: CanvasRenderingContext2D, op: Extract<ShareCardOp, { kind: "route" }>): void {
  const { path, rect, unit: u } = op;
  const scale = Math.max(path.width > 0 ? rect.w / path.width : 0, path.height > 0 ? rect.h / path.height : 0);
  const toX = (x: number) => rect.x + x * scale;
  const toY = (y: number) => rect.y + y * scale;

  const [startX, startY] = path.points[0];
  const [endX, endY] = path.points[path.points.length - 1];

  // 線がリングの内側に入らないよう、リングの円を除いた範囲だけに線を描く
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.arc(toX(endX), toY(endY), END_RADIUS * u, 0, Math.PI * 2);
  ctx.clip("evenodd");
  ctx.lineWidth = ROUTE_LINE_WIDTH * u;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  path.points.forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(toX(x), toY(y));
    else ctx.lineTo(toX(x), toY(y));
  });
  ctx.stroke();
  ctx.restore();

  // 地図の表示と同じく、始点は塗りの点、終点はリングの中に点
  ctx.beginPath();
  ctx.arc(toX(startX), toY(startY), START_RADIUS * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = END_RING_WIDTH * u;
  ctx.beginPath();
  ctx.arc(toX(endX), toY(endY), END_RADIUS * u, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(toX(endX), toY(endY), END_DOT_RADIUS * u, 0, Math.PI * 2);
  ctx.fill();
}

function paint(ctx: CanvasRenderingContext2D, layout: ShareCardLayout, color: string): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  for (const op of layout.ops) {
    ctx.globalAlpha = op.kind === "route" ? 1 : op.alpha;
    switch (op.kind) {
      case "text":
        ctx.font = op.font;
        ctx.fillText(op.text, op.x, op.y);
        break;
      case "line":
        ctx.lineWidth = op.width;
        ctx.lineCap = "butt";
        ctx.beginPath();
        ctx.moveTo(op.x1, op.y1);
        ctx.lineTo(op.x2, op.y2);
        ctx.stroke();
        break;
      case "route":
        drawRoute(ctx, op);
        break;
    }
  }
  ctx.restore();
}

export function drawShareCard(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number,
  content: ShareCardContent,
  options: ShareCardOptions,
  moving?: ShareCardBlock,
): ShareCardLayout {
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, width, height);
  const layout = layoutShareCard(ctx, width, height, content, options, moving);
  paint(ctx, layout, options.color);
  return layout;
}
