import { LABEL_FONT, NUMBER_FONT } from "@/lib/drive/renderer/types";
import type { ShareCardBlock, ShareCardFreePosition, ShareCardOptions, ShareCardPlacement } from "./options";
import type { RoutePath } from "./route";

export type ShareCardCell = { label: string; value: string; unit?: string };

// 表示する項目だけを入れる（非表示の項目は null か空にする）
export type ShareCardContent = {
  route: RoutePath | null;
  date: string | null;
  weather: string | null;
  place: string | null;
  rows: ShareCardCell[][];
};

export type Rect = { x: number; y: number; w: number; h: number };

export type ShareCardOp =
  | { kind: "text"; text: string; x: number; y: number; font: string; alpha: number }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; width: number; alpha: number }
  // unit は経路の倍率を掛けた値で、線の太さと点の大きさに使う
  | { kind: "route"; path: RoutePath; rect: Rect; unit: number };

export type ShareCardLayout = {
  // ドラッグの当たり判定に使う
  // 表示しないブロックは含まない
  rects: Partial<Record<ShareCardBlock, Rect>>;
  ops: ShareCardOp[];
  // 画像の短辺の 1/100
  // 文字や線の太さはすべてこの倍数にして、プレビューと書き出しで見た目を揃える
  unit: number;
  margin: number;
};

// 以下の大きさは unit の倍数
const MARGIN = 6;
const ROUTE_TEXT_GAP_LANDSCAPE = 5;
const ROUTE_TEXT_GAP_PORTRAIT = 3.5;
// 別々に置いた経路と情報が近づいたときに空ける間隔
const BLOCK_GAP = 3;
// 経路を収める枠の大きさ（倍率 1 のとき）
const ROUTE_MAX_LANDSCAPE = 30;
const ROUTE_MAX_WIDTH_PORTRAIT = 48;
const ROUTE_MAX_HEIGHT_PORTRAIT = 32;
// 始点と終点の印が枠からはみ出さないための余白
const ROUTE_PADDING = 1.6;
const SMALL_TEXT_SIZE = 2.8;
const SMALL_TEXT_GAP = 2.4;
const PLACE_SIZE = 4.2;
const LABEL_SIZE = 2;
const VALUE_SIZE = 4.2;
const UNIT_SIZE = 2.2;
const UNIT_GAP = 0.5;
const LABEL_VALUE_GAP = 0.6;
const DATE_PLACE_GAP = 0.6;
const HEADER_ROWS_GAP = 2.4;
const ROW_GAP = 1.8;
const CELL_PADDING = 2.2;
const DIVIDER_WIDTH = 0.2;
const LINE_HEIGHT = 1.25;
const BASELINE = 0.95;

type Piece = { w: number; h: number; ops: ShareCardOp[] };

function labelFont(weight: number, size: number): string {
  return `${weight} ${size}px ${LABEL_FONT}`;
}

function numberFont(size: number): string {
  return `600 ${size}px ${NUMBER_FONT}`;
}

function measure(ctx: CanvasRenderingContext2D, text: string, font: string): number {
  ctx.font = font;
  return ctx.measureText(text).width;
}

function moveOps(ops: ShareCardOp[], dx: number, dy: number): ShareCardOp[] {
  return ops.map((op) => {
    switch (op.kind) {
      case "text":
        return { ...op, x: op.x + dx, y: op.y + dy };
      case "line":
        return { ...op, x1: op.x1 + dx, y1: op.y1 + dy, x2: op.x2 + dx, y2: op.y2 + dy };
      case "route":
        return { ...op, rect: { ...op.rect, x: op.rect.x + dx, y: op.rect.y + dy } };
    }
  });
}

function textPiece(ctx: CanvasRenderingContext2D, text: string, font: string, size: number, alpha = 1): Piece {
  return {
    w: measure(ctx, text, font),
    h: size * LINE_HEIGHT,
    ops: [{ kind: "text", text, x: 0, y: size * BASELINE, font, alpha }],
  };
}

function rowOf(pieces: Piece[], gap: number): Piece {
  const ops: ShareCardOp[] = [];
  let x = 0;
  pieces.forEach((piece, index) => {
    if (index > 0) x += gap;
    ops.push(...moveOps(piece.ops, x, 0));
    x += piece.w;
  });
  return { w: x, h: Math.max(...pieces.map((piece) => piece.h)), ops };
}

function cellPiece(ctx: CanvasRenderingContext2D, cell: ShareCardCell, u: number): Piece {
  const label = textPiece(ctx, cell.label, labelFont(500, LABEL_SIZE * u), LABEL_SIZE * u, 0.85);
  const valueFont = numberFont(VALUE_SIZE * u);
  const valueWidth = measure(ctx, cell.value, valueFont);
  const valueTop = label.h + LABEL_VALUE_GAP * u;
  const valueBaseline = valueTop + VALUE_SIZE * u * BASELINE;
  const ops: ShareCardOp[] = [
    ...label.ops,
    { kind: "text", text: cell.value, x: 0, y: valueBaseline, font: valueFont, alpha: 1 },
  ];
  let valueLineWidth = valueWidth;
  if (cell.unit) {
    const unitFont = labelFont(500, UNIT_SIZE * u);
    ops.push({ kind: "text", text: cell.unit, x: valueWidth + UNIT_GAP * u, y: valueBaseline, font: unitFont, alpha: 0.9 });
    valueLineWidth += UNIT_GAP * u + measure(ctx, cell.unit, unitFont);
  }
  return { w: Math.max(label.w, valueLineWidth), h: valueTop + VALUE_SIZE * u * 1.1, ops };
}

// 区切り線が行をまたいで揃うよう、セルを列に揃えて並べる。右揃えでは各行の最後のセルを右端の列に置く
function gridPiece(ctx: CanvasRenderingContext2D, rows: ShareCardCell[][], u: number, alignRight: boolean): Piece | null {
  const cellRows = rows.filter((row) => row.length > 0).map((row) => row.map((cell) => cellPiece(ctx, cell, u)));
  if (cellRows.length === 0) return null;

  const columnCount = Math.max(...cellRows.map((row) => row.length));
  const columnOf = (row: Piece[], index: number) => (alignRight ? columnCount - row.length + index : index);
  const columnWidths = Array.from({ length: columnCount }, () => 0);
  for (const row of cellRows) {
    row.forEach((piece, index) => {
      const column = columnOf(row, index);
      columnWidths[column] = Math.max(columnWidths[column], piece.w);
    });
  }
  const padding = CELL_PADDING * u;
  const columnXs: number[] = [];
  let x = 0;
  for (const width of columnWidths) {
    columnXs.push(x);
    x += width + padding * 2;
  }
  const w = x - padding * 2;
  const rowHeight = Math.max(...cellRows.flat().map((piece) => piece.h));

  const ops: ShareCardOp[] = [];
  cellRows.forEach((row, rowIndex) => {
    const y = rowIndex * (rowHeight + ROW_GAP * u);
    row.forEach((piece, index) => {
      const column = columnOf(row, index);
      const cellX = columnXs[column] + (alignRight ? columnWidths[column] - piece.w : 0);
      ops.push(...moveOps(piece.ops, cellX, y));
      if (index > 0) {
        const lineX = columnXs[column] - padding;
        ops.push({
          kind: "line",
          x1: lineX,
          y1: y + rowHeight * 0.1,
          x2: lineX,
          y2: y + rowHeight,
          width: DIVIDER_WIDTH * u,
          alpha: 0.6,
        });
      }
    });
  });
  return { w, h: cellRows.length * rowHeight + (cellRows.length - 1) * ROW_GAP * u, ops };
}

function infoPiece(ctx: CanvasRenderingContext2D, content: ShareCardContent, u: number, alignRight: boolean): Piece | null {
  const lines: { piece: Piece; gapBefore: number }[] = [];
  const smallTexts = [content.date, content.weather]
    .filter((text): text is string => text !== null)
    .map((text) => textPiece(ctx, text, labelFont(500, SMALL_TEXT_SIZE * u), SMALL_TEXT_SIZE * u, 0.9));
  if (smallTexts.length > 0) lines.push({ piece: rowOf(smallTexts, SMALL_TEXT_GAP * u), gapBefore: 0 });
  if (content.place) {
    lines.push({
      piece: textPiece(ctx, content.place, labelFont(700, PLACE_SIZE * u), PLACE_SIZE * u),
      gapBefore: DATE_PLACE_GAP * u,
    });
  }
  const grid = gridPiece(ctx, content.rows, u, alignRight);
  if (grid) lines.push({ piece: grid, gapBefore: HEADER_ROWS_GAP * u });
  if (lines.length === 0) return null;

  const w = Math.max(...lines.map(({ piece }) => piece.w));
  const ops: ShareCardOp[] = [];
  let y = 0;
  lines.forEach(({ piece, gapBefore }, index) => {
    if (index > 0) y += gapBefore;
    ops.push(...moveOps(piece.ops, alignRight ? w - piece.w : 0, y));
    y += piece.h;
  });
  return { w, h: y, ops };
}

function routePiece(path: RoutePath, maxW: number, maxH: number, u: number): Piece {
  const pad = ROUTE_PADDING * u;
  const innerMaxW = Math.max(maxW - pad * 2, 0);
  const innerMaxH = Math.max(maxH - pad * 2, 0);
  // 南北や東西にまっすぐな経路は幅か高さが 0 になるため、もう一方の辺だけで大きさを決める
  const scale = Math.min(
    path.width > 0 ? innerMaxW / path.width : Infinity,
    path.height > 0 ? innerMaxH / path.height : Infinity,
  );
  const w = path.width * scale;
  const h = path.height * scale;
  return { w: w + pad * 2, h: h + pad * 2, ops: [{ kind: "route", path, rect: { x: pad, y: pad, w, h }, unit: u }] };
}

function isRightAligned(placement: ShareCardPlacement): boolean {
  if (placement.position === "free") return placement.free.x > 0.5;
  return placement.position === "topRight" || placement.position === "bottomRight";
}

function positionFraction(placement: ShareCardPlacement): ShareCardFreePosition {
  switch (placement.position) {
    case "topLeft":
      return { x: 0, y: 0 };
    case "topRight":
      return { x: 1, y: 0 };
    case "bottomLeft":
      return { x: 0, y: 1 };
    case "bottomRight":
      return { x: 1, y: 1 };
    case "free":
      return placement.free;
  }
}

function placeAt(
  placement: ShareCardPlacement,
  w: number,
  h: number,
  width: number,
  height: number,
  margin: number,
): { x: number; y: number } {
  const fraction = positionFraction(placement);
  return {
    x: margin + fraction.x * Math.max(width - margin * 2 - w, 0),
    y: margin + fraction.y * Math.max(height - margin * 2 - h, 0),
  };
}

export function layoutShareCard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  content: ShareCardContent,
  options: ShareCardOptions,
  // ドラッグ中のブロック
  // 重なったときは、こちらをずらす
  moving?: ShareCardBlock,
): ShareCardLayout {
  const u = Math.min(width, height) / 100;
  const margin = MARGIN * u;
  const { route: routePlacement, info: infoPlacement } = options.placements;
  const alignRight = isRightAligned(infoPlacement);
  const landscape = width > height;
  const info = infoPiece(ctx, content, u * infoPlacement.scale, alignRight);

  let route: Piece | null = null;
  if (content.route) {
    const routeU = u * routePlacement.scale;
    route = landscape
      ? routePiece(content.route, ROUTE_MAX_LANDSCAPE * routeU, ROUTE_MAX_LANDSCAPE * routeU, routeU)
      : routePiece(content.route, ROUTE_MAX_WIDTH_PORTRAIT * routeU, ROUTE_MAX_HEIGHT_PORTRAIT * routeU, routeU);
  }

  const ops: ShareCardOp[] = [];
  const rects: Partial<Record<ShareCardBlock, Rect>> = {};
  const place = (block: ShareCardBlock, piece: Piece, x: number, y: number) => {
    rects[block] = { x, y, w: piece.w, h: piece.h };
    ops.push(...moveOps(piece.ops, x, y));
  };

  // 同じ隅を選んだときは重ならないよう、まとめて1つのブロックとして並べる
  if (route && info && routePlacement.position !== "free" && routePlacement.position === infoPlacement.position) {
    if (landscape) {
      // 経路は画像の端の側に置き、文字を内側に並べる
      const gap = ROUTE_TEXT_GAP_LANDSCAPE * u;
      const blockW = route.w + gap + info.w;
      const blockH = Math.max(route.h, info.h);
      const origin = placeAt(infoPlacement, blockW, blockH, width, height, margin);
      place("route", route, origin.x + (alignRight ? info.w + gap : 0), origin.y + (blockH - route.h) / 2);
      place("info", info, origin.x + (alignRight ? 0 : route.w + gap), origin.y + (blockH - info.h) / 2);
    } else {
      const gap = ROUTE_TEXT_GAP_PORTRAIT * u;
      const blockW = Math.max(route.w, info.w);
      const blockH = route.h + gap + info.h;
      const origin = placeAt(infoPlacement, blockW, blockH, width, height, margin);
      place("route", route, origin.x + (alignRight ? blockW - route.w : 0), origin.y);
      place("info", info, origin.x + (alignRight ? blockW - info.w : 0), origin.y + route.h + gap);
    }
  } else {
    const routeOrigin = route ? placeAt(routePlacement, route.w, route.h, width, height, margin) : null;
    const infoOrigin = info ? placeAt(infoPlacement, info.w, info.h, width, height, margin) : null;
    if (route && info && routeOrigin && infoOrigin) {
      const routeRect = { ...routeOrigin, w: route.w, h: route.h };
      const infoRect = { ...infoOrigin, w: info.w, h: info.h };
      const shifted = moving ?? blockToShift(routePlacement, infoPlacement);
      const bounds = { width, height, margin };
      const gap = BLOCK_GAP * u;
      if (shifted === "route") Object.assign(routeOrigin, avoidOverlap(routeRect, infoRect, bounds, gap));
      else Object.assign(infoOrigin, avoidOverlap(infoRect, routeRect, bounds, gap));
    }
    if (route && routeOrigin) place("route", route, routeOrigin.x, routeOrigin.y);
    if (info && infoOrigin) place("info", info, infoOrigin.x, infoOrigin.y);
  }

  return { rects, ops, unit: u, margin };
}

// 隅に置いたブロックはその位置を保ち、自由配置のブロックをずらす。どちらも同じ種類なら情報をずらす
function blockToShift(route: ShareCardPlacement, info: ShareCardPlacement): ShareCardBlock {
  if (route.position === "free" && info.position !== "free") return "route";
  return "info";
}

// 重なっているとき、fixed の上下左右のうち画像に収まり、動く量がいちばん少ない位置へずらす
function avoidOverlap(
  rect: Rect,
  fixed: Rect,
  { width, height, margin }: { width: number; height: number; margin: number },
  gap: number,
): { x: number; y: number } {
  const overlaps =
    rect.x < fixed.x + fixed.w + gap &&
    fixed.x < rect.x + rect.w + gap &&
    rect.y < fixed.y + fixed.h + gap &&
    fixed.y < rect.y + rect.h + gap;
  if (!overlaps) return { x: rect.x, y: rect.y };

  const minX = margin;
  const maxX = width - margin - rect.w;
  const minY = margin;
  const maxY = height - margin - rect.h;
  const candidates = [
    { x: fixed.x - gap - rect.w, y: rect.y },
    { x: fixed.x + fixed.w + gap, y: rect.y },
    { x: rect.x, y: fixed.y - gap - rect.h },
    { x: rect.x, y: fixed.y + fixed.h + gap },
  ].filter(({ x, y }) => x >= minX - 0.5 && x <= maxX + 0.5 && y >= minY - 0.5 && y <= maxY + 0.5);
  // どこにも収まらないほど大きいときは重なったままにする
  if (candidates.length === 0) return { x: rect.x, y: rect.y };
  const distance = ({ x, y }: { x: number; y: number }) => Math.hypot(x - rect.x, y - rect.y);
  return candidates.reduce((best, candidate) => (distance(candidate) < distance(best) ? candidate : best));
}

// 大きさ size のブロックの左上を (x, y) に動かしたときの自由配置の位置
export function freePositionAt(
  layout: ShareCardLayout,
  size: { w: number; h: number },
  width: number,
  height: number,
  x: number,
  y: number,
): ShareCardFreePosition {
  const rangeX = width - layout.margin * 2 - size.w;
  const rangeY = height - layout.margin * 2 - size.h;
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return {
    x: rangeX > 0 ? clamp((x - layout.margin) / rangeX) : 0,
    y: rangeY > 0 ? clamp((y - layout.margin) / rangeY) : 0,
  };
}
