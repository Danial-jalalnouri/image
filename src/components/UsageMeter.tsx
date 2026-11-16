"use client";

import { formatUsd, type LimitSet, type UsageSnapshot } from "@/lib/limits";

/**
 * Shows the signed-in user how much of their spend allowance they have used.
 * Windows match the server-side enforcement exactly (calendar UTC), and the
 * limits come from the settings table via /api/me (not hard-coded).
 */
export function UsageMeter({ usage, limits }: { usage: UsageSnapshot | null; limits: LimitSet }) {
  if (!usage) return null;

  const rows: Array<{ label: string; used: number; limit: number; note: string }> = [
    { label: "Today", used: usage.dailyUsed, limit: limits.daily, note: "resets midnight UTC" },
    { label: "This week", used: usage.weeklyUsed, limit: limits.weekly, note: "resets Monday UTC" },
    { label: "All time", used: usage.totalUsed, limit: limits.total, note: "lifetime budget" },
  ];

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/15 text-[11px] font-bold text-indigo-300">
          $
        </span>
        <h2 className="text-sm font-semibold text-zinc-200">Your usage</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {rows.map((row) => {
          const remaining = Math.max(0, row.limit - row.used);
          const pct = Math.min(100, Math.max(0, (row.used / row.limit) * 100));
          const exhausted = remaining <= 0;
          return (
            <div key={row.label}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-medium text-zinc-300">{row.label}</span>
                <span className={exhausted ? "font-semibold text-rose-300" : "text-zinc-500"}>
                  {formatUsd(row.used)} / {formatUsd(row.limit)}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full transition-all ${exhausted ? "bg-rose-400" : "bg-gradient-to-r from-indigo-400 to-violet-400"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-zinc-600">
                {exhausted ? "Limit reached" : `${formatUsd(remaining)} left`} · {row.note}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
