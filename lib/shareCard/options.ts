export const shareCardItems = ["route", "date", "place", "weather", "distance", "duration", "speed", "gForce"] as const;
export type ShareCardItem = (typeof shareCardItems)[number];

// 経路と情報（経路以外の項目）は別々に配置できる
export const shareCardBlocks = ["route", "info"] as const;
export type ShareCardBlock = (typeof shareCardBlocks)[number];

export const shareCardPositions = ["topLeft", "topRight", "bottomLeft", "bottomRight", "free"] as const;
export type ShareCardPosition = (typeof shareCardPositions)[number];

// 自由配置の位置
// 動かせる範囲（余白の内側）に対する割合で持ち、画像の大きさが変わってもはみ出さないようにする
export type ShareCardFreePosition = { x: number; y: number };

// scale は既定の大きさに対する倍率
export type ShareCardPlacement = { position: ShareCardPosition; free: ShareCardFreePosition; scale: number };

export const SHARE_CARD_SCALE_MIN = 0.6;
export const SHARE_CARD_SCALE_MAX = 1.6;

export type ShareCardOptions = {
  items: Record<ShareCardItem, boolean>;
  placements: Record<ShareCardBlock, ShareCardPlacement>;
  color: string;
};

export const SHARE_CARD_PRESET_COLORS = [
  { id: "white", value: "#ffffff" },
  { id: "black", value: "#000000" },
] as const;

export const DEFAULT_SHARE_CARD_OPTIONS: ShareCardOptions = {
  items: {
    route: true,
    date: true,
    place: true,
    weather: false,
    distance: true,
    duration: true,
    speed: true,
    gForce: false,
  },
  placements: {
    route: { position: "bottomLeft", free: { x: 0, y: 1 }, scale: 1 },
    info: { position: "bottomLeft", free: { x: 0, y: 1 }, scale: 1 },
  },
  color: SHARE_CARD_PRESET_COLORS[0].value,
};

export const SHARE_CARD_STORAGE_KEY = "vertia.shareCard";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clampFraction(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

function readPlacement(value: unknown, fallback: ShareCardPlacement): ShareCardPlacement {
  if (!isRecord(value)) return fallback;
  const free = isRecord(value.free) ? value.free : {};
  const scale =
    typeof value.scale === "number" && Number.isFinite(value.scale)
      ? Math.min(SHARE_CARD_SCALE_MAX, Math.max(SHARE_CARD_SCALE_MIN, value.scale))
      : fallback.scale;
  return {
    position: shareCardPositions.find((p) => p === value.position) ?? fallback.position,
    free: { x: clampFraction(free.x, fallback.free.x), y: clampFraction(free.y, fallback.free.y) },
    scale,
  };
}

// 壊れた値が保存されていても、読めた項目だけ使い残りは既定値にする
export function loadShareCardOptions(): ShareCardOptions {
  const defaults = DEFAULT_SHARE_CARD_OPTIONS;
  let stored: unknown = null;
  try {
    const raw = window.localStorage.getItem(SHARE_CARD_STORAGE_KEY);
    stored = raw === null ? null : JSON.parse(raw);
  } catch {
  }
  if (!isRecord(stored)) return defaults;

  const storedItems = isRecord(stored.items) ? stored.items : {};
  const items = Object.fromEntries(
    shareCardItems.map((item) => {
      const value = storedItems[item];
      return [item, typeof value === "boolean" ? value : defaults.items[item]];
    }),
  ) as Record<ShareCardItem, boolean>;
  const storedPlacements = isRecord(stored.placements) ? stored.placements : {};
  const placements = {
    route: readPlacement(storedPlacements.route, defaults.placements.route),
    info: readPlacement(storedPlacements.info, defaults.placements.info),
  };
  const color = SHARE_CARD_PRESET_COLORS.find(({ value }) => value === stored.color)?.value ?? defaults.color;
  return { items, placements, color };
}

export function saveShareCardOptions(options: ShareCardOptions): void {
  try {
    window.localStorage.setItem(SHARE_CARD_STORAGE_KEY, JSON.stringify(options));
  } catch {
  }
}
