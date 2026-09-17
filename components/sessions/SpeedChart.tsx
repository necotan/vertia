"use client";

import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useMemo } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { GpsPoint } from "@/lib/db/schema";
import { buildSpeedSeries } from "@/lib/drive/speedSeries";
import { formatDuration } from "@/lib/format";
import { mpsToUnit, speedUnitOf, useDistanceUnit } from "@/lib/units";

const CHART_COLORS = {
  light: {
    line: "#171717",
    grid: "#e5e5e5",
    tick: "#737373",
    tooltipBg: "#ffffff",
    tooltipBorder: "#e5e5e5",
    tooltipText: "#0a0a0a",
  },
  dark: {
    line: "#fafafa",
    grid: "#262626",
    tick: "#a3a3a3",
    tooltipBg: "#171717",
    tooltipBorder: "#262626",
    tooltipText: "#fafafa",
  },
} as const;

const formatElapsed = (seconds: number) => formatDuration(seconds * 1000);

export function SpeedChart({ points, startedAt }: { points: GpsPoint[]; startedAt: number }) {
  const t = useTranslations("sessions.detail.speedChart");
  const { resolvedTheme } = useTheme();
  const colors = CHART_COLORS[resolvedTheme === "dark" ? "dark" : "light"];
  const tUnits = useTranslations("units");
  const unit = useDistanceUnit();
  const speedUnit = tUnits(speedUnitOf[unit]);
  const data = useMemo(
    () => buildSpeedSeries(points, startedAt).map((s) => ({ t: s.t, speed: mpsToUnit(s.mps, unit) })),
    [points, startedAt, unit],
  );

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-muted-foreground">{t("title")}</h2>
      <div className="h-56 w-full rounded-2xl border border-border bg-card p-2">
        {data.length === 0 ? (
          <p className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 4 }}>
              <defs>
                <linearGradient id="speedChartArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors.line} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={colors.line} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colors.grid} />
              <XAxis
                dataKey="t"
                type="number"
                domain={[0, "dataMax"]}
                fontSize={10}
                axisLine={false}
                tickLine={false}
                tick={{ fill: colors.tick }}
                tickFormatter={formatElapsed}
                minTickGap={24}
              />
              <YAxis
                dataKey="speed"
                domain={[0, "auto"]}
                fontSize={10}
                axisLine={false}
                tickLine={false}
                tick={{ fill: colors.tick }}
                width={36}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ stroke: colors.grid }}
                contentStyle={{
                  borderRadius: "8px",
                  border: `1px solid ${colors.tooltipBorder}`,
                  boxShadow: "none",
                  backgroundColor: colors.tooltipBg,
                }}
                itemStyle={{ color: colors.tooltipText }}
                labelStyle={{ color: colors.tooltipText }}
                labelFormatter={(label) => formatElapsed(Number(label))}
                formatter={(value) => [`${Math.round(Number(value))} ${speedUnit}`, t("speed")]}
              />
              <Area
                type="linear"
                dataKey="speed"
                stroke="none"
                fill="url(#speedChartArea)"
                isAnimationActive={false}
                activeDot={false}
                // 折れ線と同じ値のため、ツールチップに2行出ないよう面の側は出さない
                tooltipType="none"
              />
              <Line
                type="linear"
                dataKey="speed"
                stroke={colors.line}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
