"use client";

import { useTranslations } from "next-intl";
import { SPEED_BAND_COLORS, SPEED_LEGEND_TICKS, speedBandBoundary } from "@/lib/routeSpeed";
import { speedUnitOf, useDistanceUnit } from "@/lib/units";

export function RouteSpeedLegend({ className }: { className: string }) {
  const t = useTranslations("sessions.detail.map.speedColors");
  const tUnits = useTranslations("units");
  const unit = useDistanceUnit();
  const lastIndex = SPEED_BAND_COLORS.length - 1;

  return (
    <div
      role="img"
      aria-label={t("legend")}
      className={`pointer-events-none rounded-lg border border-border bg-background/90 px-2.5 pb-1 pt-2 text-foreground backdrop-blur-md ${className}`}
    >
      <div className="flex w-36 overflow-hidden rounded-full">
        {SPEED_BAND_COLORS.map((color) => (
          <span key={color} className="h-1.5 flex-1" style={{ backgroundColor: color }} />
        ))}
      </div>
      <div className="relative mt-0.5 h-4 w-36 text-[10px] leading-4 tabular-nums">
        {SPEED_LEGEND_TICKS.map((index) => (
          <span
            key={index}
            className={`absolute top-0 ${index === 0 ? "" : "-translate-x-1/2"}`}
            style={{ left: `${(index / SPEED_BAND_COLORS.length) * 100}%` }}
          >
            {speedBandBoundary(unit, index)}
            {index === lastIndex && "+"}
          </span>
        ))}
      </div>
      <p className="text-right text-[10px] leading-3 text-muted-foreground">{tUnits(speedUnitOf[unit])}</p>
    </div>
  );
}
