"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";
import { CHART_COLORS } from "@/lib/chartColors";
import type { HomeStats as HomeStatsData, MonthlyDistance } from "@/lib/homeStats";
import { metersToUnit, useDistanceUnit } from "@/lib/units";

const TILE_CLASS = "flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4";
const UNIT_CLASS = "ml-1 text-xs font-normal text-muted-foreground";

type StatItem = { label: string; value: ReactNode | null };

// 読み込み中は value に null を渡し、同じ行の高さのスケルトンにする
function StatGrid({ items }: { items: StatItem[] }) {
  return (
    <dl className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd>
            {item.value === null ? (
              <SkeletonText size="lg" className="mt-1 w-20" />
            ) : (
              <p className="mt-1 flex flex-wrap items-baseline font-mono text-lg font-semibold">{item.value}</p>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// recharts の既定では 35 刻みのような半端な間隔になり、整数に限ると最大が 1 未満のとき棒がほとんど見えないため、1・2・5 の系列で刻む
const Y_AXIS_INTERVALS = 4;

function distanceTicks(max: number): number[] {
  const raw = (max > 0 ? max : 1) / Y_AXIS_INTERVALS;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const count = Math.ceil((max > 0 ? max : 1) / step - 1e-9);
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  return Array.from({ length: count + 1 }, (_, i) => Number((step * i).toFixed(decimals)));
}

function MonthlyChart({ monthly }: { monthly: MonthlyDistance[] | null }) {
  const t = useTranslations("home.stats");
  const tUnits = useTranslations("units");
  const format = useFormatter();
  const unit = useDistanceUnit();
  const { resolvedTheme } = useTheme();
  const colors = CHART_COLORS[resolvedTheme === "dark" ? "dark" : "light"];

  if (!monthly) return <Skeleton className="h-40 rounded-md" />;
  const data = monthly.map((m) => ({ monthStart: m.monthStart, distance: metersToUnit(m.distanceM, unit) }));
  const ticks = distanceTicks(Math.max(...data.map((d) => d.distance)));

  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 12, left: -4, bottom: 8 }} barCategoryGap="30%" maxBarSize={56}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colors.grid} />
          <XAxis
            dataKey="monthStart"
            dy={10}
            fontSize={10}
            axisLine={false}
            tickLine={false}
            tick={{ fill: colors.tick }}
            tickFormatter={(value) => format.dateTime(Number(value), { month: "short" })}
          />
          <YAxis
            width={36}
            fontSize={10}
            axisLine={false}
            tickLine={false}
            // 既定の目盛りは軸の右端に右揃えで描かれるため、上の単位とそろうよう左端から左揃えで描く
            tick={({ y, payload }) => (
              <text x={0} y={y} dy="0.355em" textAnchor="start" fontSize={10} fill={colors.tick}>
                {format.number(Number(payload.value))}
              </text>
            )}
            ticks={ticks}
            domain={[0, ticks[ticks.length - 1]]}
            interval={0}
          />
          <Tooltip
            wrapperStyle={{ zIndex: 10 }}
            cursor={{ fill: colors.cursor }}
            contentStyle={{
              borderRadius: "8px",
              border: `1px solid ${colors.tooltipBorder}`,
              boxShadow: "none",
              backgroundColor: colors.tooltipBg,
            }}
            itemStyle={{ color: colors.tooltipText }}
            labelStyle={{ color: colors.tooltipText }}
            labelFormatter={(label) => format.dateTime(Number(label), { year: "numeric", month: "long" })}
            formatter={(value) => [
              `${format.number(Number(value), { maximumFractionDigits: 1 })} ${tUnits(unit)}`,
              t("distance"),
            ]}
          />
          <Bar dataKey="distance" fill={colors.line} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// stats が null のときは読み込み中として、同じ配置のスケルトンを出す
export function HomeStats({ stats }: { stats: HomeStatsData | null }) {
  const t = useTranslations("home.stats");
  const tUnits = useTranslations("units");
  const format = useFormatter();
  const unit = useDistanceUnit();

  const withUnit = (value: string, unitLabel: string) => (
    <>
      {value}
      <span className={UNIT_CLASS}>{unitLabel}</span>
    </>
  );

  // 3列の狭いタイルに収まるよう、大きい合計は小数を出さない
  const totalDistance = stats ? metersToUnit(stats.totalM, unit) : 0;
  const totalHours = stats ? stats.totalMs / 3_600_000 : 0;

  return (
    <div className="flex flex-col gap-2" aria-busy={stats === null}>
      <div className={TILE_CLASS}>
        <span className="text-[10px] text-muted-foreground">{t("unitLabel", { unit: tUnits(unit) })}</span>
        <MonthlyChart monthly={stats?.monthly ?? null} />
      </div>

      <div className={TILE_CLASS}>
        <StatGrid
          items={[
            {
              label: t("totalDistance"),
              value: stats
                ? withUnit(
                    format.number(totalDistance, { maximumFractionDigits: totalDistance >= 100 ? 0 : 1 }),
                    tUnits(unit),
                  )
                : null,
            },
            {
              label: t("count"),
              value: stats
                ? t.rich("countValue", {
                    count: stats.count,
                    unit: (chunks) => <span className={UNIT_CLASS}>{chunks}</span>,
                  })
                : null,
            },
            {
              label: t("totalDuration"),
              value: stats
                ? withUnit(format.number(totalHours, { maximumFractionDigits: totalHours >= 100 ? 0 : 1 }), t("hoursUnit"))
                : null,
            },
          ]}
        />
      </div>
    </div>
  );
}
