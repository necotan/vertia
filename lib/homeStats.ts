import type { DriveSession, SessionSummary } from "@/lib/db/schema";

export const MONTHLY_BAR_COUNT = 6;

export interface MonthlyDistance {
  monthStart: number;
  distanceM: number;
}

export interface HomeStats {
  // 古い月から順に並べ、最後が今月
  monthly: MonthlyDistance[];
  totalM: number;
  count: number;
  totalMs: number;
}

type SummarizedSession = DriveSession & { summary: SessionSummary };

// 月の区切りは端末のローカル時刻で決める
export function computeHomeStats(sessions: DriveSession[], now: number): HomeStats | null {
  const summarized = sessions.filter((s): s is SummarizedSession => s.summary !== null);
  if (summarized.length === 0) return null;

  const today = new Date(now);
  const monthly: MonthlyDistance[] = Array.from({ length: MONTHLY_BAR_COUNT }, (_, i) => ({
    monthStart: new Date(today.getFullYear(), today.getMonth() - (MONTHLY_BAR_COUNT - 1 - i), 1).getTime(),
    distanceM: 0,
  }));

  let totalM = 0;
  let totalMs = 0;
  for (const { startedAt, summary } of summarized) {
    totalM += summary.distanceM;
    totalMs += summary.durationMs;
    for (let i = monthly.length - 1; i >= 0; i--) {
      if (startedAt >= monthly[i].monthStart) {
        monthly[i].distanceM += summary.distanceM;
        break;
      }
    }
  }

  return {
    monthly,
    totalM,
    count: summarized.length,
    totalMs,
  };
}
