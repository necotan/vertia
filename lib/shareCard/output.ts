import { formatFileDate } from "@/lib/db/sessionTransfer";
import { drawShareCard } from "./draw";
import type { ShareCardContent } from "./layout";
import type { ShareCardOptions } from "./options";

// iOS Safari は Canvas の面積とメモリに上限があり、高画素の写真をそのまま扱うと描画に失敗するため縮小する
const MAX_IMAGE_EDGE = 2560;
const PREVIEW_MAX_EDGE = 1600;
const JPEG_QUALITY = 0.92;

export function fitSize(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function previewSize(image: HTMLCanvasElement): { width: number; height: number } {
  return fitSize(image.width, image.height, PREVIEW_MAX_EDGE);
}

/** EXIF の向きは img の読み込み時にブラウザが適用する。Canvas に描き直すため、写真の位置情報などのメタデータは書き出しに残らない */
export async function loadShareImage(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const { width, height } = fitSize(img.naturalWidth, img.naturalHeight, MAX_IMAGE_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is unavailable");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function renderShareCardBlob(
  image: HTMLCanvasElement,
  content: ShareCardContent,
  options: ShareCardOptions,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is unavailable");
    drawShareCard(ctx, image, canvas.width, canvas.height, content, options);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/jpeg", JPEG_QUALITY);
    });
  } finally {
    // iOS Safari は使い終わった Canvas のメモリをすぐ解放しないため、大きさを 0 にして解放させる
    canvas.width = 0;
    canvas.height = 0;
  }
}

export function shareCardFileName(startedAt: number): string {
  return `vertia-${formatFileDate(startedAt)}.jpg`;
}
