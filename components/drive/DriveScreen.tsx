"use client";

import { ChevronLeft, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { recoverInterruptedSessions } from "@/lib/db/sessionRepository";
import { DriveController, initialDriveUiState, type DriveUiState } from "@/lib/drive/DriveController";
import { DriveRenderer } from "@/lib/drive/renderer/DriveRenderer";
import { TOP_BAR_Y } from "@/lib/drive/renderer/layout";
import { setDrivePalette, type DriveLabels, type Rect } from "@/lib/drive/renderer/types";

export function DriveScreen() {
  const t = useTranslations("drive");
  const tCommon = useTranslations("common");
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<DriveController | null>(null);
  const rendererRef = useRef<DriveRenderer | null>(null);
  const [ui, setUi] = useState<DriveUiState>(initialDriveUiState);
  const [hintRect, setHintRect] = useState<Rect | null>(null);

  const labels = useMemo<DriveLabels>(
    () => ({
      speedUnit: t("canvas.speedUnit"),
      avg: t("canvas.avg"),
      median: t("canvas.median"),
      max: t("canvas.max"),
      gpsAccuracy: t("canvas.gpsAccuracy"),
      gpsWaiting: t("canvas.gpsWaiting"),
      gUnit: t("canvas.gUnit"),
    }),
    [t],
  );
  const labelsRef = useRef(labels);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (resolvedTheme) setDrivePalette(resolvedTheme === "dark" ? "dark" : "light");
  }, [resolvedTheme]);

  useEffect(() => {
    labelsRef.current = labels;
    rendererRef.current?.setLabels(labels);
  }, [labels]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller = new DriveController(setUi);
    const renderer = new DriveRenderer(canvas, controller.getFrame, labelsRef.current, (layout) =>
      setHintRect(layout.hint),
    );
    controllerRef.current = controller;
    rendererRef.current = renderer;
    // next-themes のテーマが確定する前の最初のフレームも正しい配色で描くよう、<html> のクラスから決めておく
    setDrivePalette(document.documentElement.classList.contains("dark") ? "dark" : "light");
    renderer.start();
    void recoverInterruptedSessions();

    return () => {
      renderer.stop();
      void controller.dispose();
      controllerRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  const { phase, error, wakeLock } = ui;
  const busy = phase === "starting" || phase === "saving";
  const canLeave = phase !== "recording" && phase !== "saving";

  useEffect(() => {
    if (error) toast.error(t(`errors.${error}`));
  }, [error, t, toast]);

  useEffect(() => {
    if (wakeLock === "failed" || wakeLock === "unsupported") toast.info(t(`wakeLock.${wakeLock}`));
  }, [wakeLock, t, toast]);

  let message: string | null = null;
  if (phase === "idle") message = t("startHint");
  else if (phase === "calibrating") message = t("calibrating");

  return (
    <div className="drive-screen fixed inset-0 flex flex-col bg-white text-foreground dark:bg-black [padding:env(safe-area-inset-top)_env(safe-area-inset-right)_env(safe-area-inset-bottom)_env(safe-area-inset-left)]">
      <div className="relative min-h-0 flex-1">
        <canvas ref={canvasRef} className="absolute inset-0 block size-full touch-none" />

        {canLeave && (
          <Link
            href="/"
            aria-label={tCommon("back")}
            style={{ top: TOP_BAR_Y }}
            className="absolute left-2 flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <ChevronLeft className="size-6" />
          </Link>
        )}

        {message && hintRect !== null && (
          <p
            role="status"
            style={{ left: 0, right: 0, bottom: 0, height: hintRect.h }}
            className="absolute flex items-center justify-center px-4 text-center text-sm text-muted-foreground"
          >
            {message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-[3rem_1fr_3rem] items-center gap-3 px-4 pb-4">
        <span />

        <div className="flex justify-center">
          {(phase === "idle" || phase === "error" || phase === "starting" || phase === "calibrating") && (
            <Button
              variant="primary"
              onClick={() => void controllerRef.current?.start()}
              disabled={phase === "starting" || phase === "calibrating"}
              className="w-full max-w-xs"
            >
              {t("start")}
            </Button>
          )}
          {phase === "ready" && (
            <Button
              variant="primary"
              onClick={() => void controllerRef.current?.startRecording()}
              className="w-full max-w-xs"
            >
              {t("recordStart")}
            </Button>
          )}
          {(phase === "recording" || phase === "saving") && (
            <Button
              variant="outline"
              onClick={() => void controllerRef.current?.stopRecording()}
              disabled={busy}
              className="w-full max-w-xs"
            >
              {phase === "saving" ? t("saving") : t("recordStop")}
            </Button>
          )}
        </div>

        {phase === "ready" ? (
          <button
            type="button"
            onClick={() => controllerRef.current?.recalibrate()}
            aria-label={t("recalibrate")}
            title={t("recalibrate")}
            className="flex size-12 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <RotateCcw className="size-5" />
          </button>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
