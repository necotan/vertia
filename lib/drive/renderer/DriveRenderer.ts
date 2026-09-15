import { drawGMagnitude } from "./drawGMagnitude";
import { drawGMeter } from "./drawGMeter";
import { drawGpsAccuracy } from "./drawGpsAccuracy";
import { drawRecordingTime } from "./drawRecordingTime";
import { drawSpeed } from "./drawSpeed";
import { drawStats } from "./drawStats";
import { computeLayout, type DriveLayout } from "./layout";
export type { DriveLayout } from "./layout";
import { COLORS, loadCanvasFonts, type DriveFrame, type DriveLabels } from "./types";

// React の再レンダリングを介さず、requestAnimationFrame で Canvas に直接描画する
export class DriveRenderer {
  private ctx: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private resizeObserver: ResizeObserver;
  private cssWidth = 0;
  private cssHeight = 0;
  private dpr = 1;
  private layout: DriveLayout | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly getFrame: () => DriveFrame,
    private labels: DriveLabels,
    private readonly onLayoutChange: (layout: DriveLayout) => void,
  ) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D context is not available");
    this.ctx = ctx;
    this.resizeObserver = new ResizeObserver(() => this.resize());
  }

  start(): void {
    void loadCanvasFonts(Object.values(this.labels).join(""));
    this.resizeObserver.observe(this.canvas);
    this.resize();
    if (this.rafId === null) this.rafId = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.resizeObserver.disconnect();
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  setLabels(labels: DriveLabels): void {
    this.labels = labels;
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.cssWidth = rect.width;
    this.cssHeight = rect.height;
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    this.layout = computeLayout(rect.width, rect.height);
    this.onLayoutChange(this.layout);
  }

  private readonly loop = (): void => {
    this.draw();
    this.rafId = requestAnimationFrame(this.loop);
  };

  private draw(): void {
    const { ctx, layout } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);
    if (!layout) return;

    const frame = this.getFrame();
    drawRecordingTime(ctx, layout.top, frame.recordingElapsedMs);
    drawGpsAccuracy(ctx, layout.top, frame, this.labels);
    drawGMagnitude(ctx, layout.top, frame.g, this.labels);
    drawSpeed(ctx, layout.speed, frame.speedKmh, this.labels);
    drawGMeter(ctx, layout.gMeter, frame.g);
    drawStats(ctx, layout.stats, frame, this.labels);
  }
}
