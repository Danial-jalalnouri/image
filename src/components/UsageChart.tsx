"use client";

import { formatUsd } from "@/lib/limits";

/** Mirrors `DailyUsagePoint` from the server DB layer (kept local so client code never imports the server module). */
export interface DailyUsagePoint {
  /** `YYYY-MM-DD` (UTC). */
  day: string;
  used: number;
  count: number;
}

/** Chart geometry (viewBox units — the SVG scales to its container). */
const WIDTH = 560;
const HEIGHT = 170;
const MARGIN = { top: 8, right: 6, bottom: 20, left: 46 };

/**
 * Dependency-free SVG bar chart of all-user API spend per UTC day.
 * Bars are cost; hover a column for the exact dollars and generation count.
 */
export function UsageChart({ days }: { days: DailyUsagePoint[] }) {
  const totalUsed = days.reduce((sum, point) => sum + point.used, 0);
  const totalCount = days.reduce((sum, point) => sum + point.count, 0);
  const maxValue = Math.max(...days.map((point) => point.used), 0);
  const yMax = niceCeiling(maxValue);

  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const slot = days.length > 0 ? plotWidth / days.length : plotWidth;
  const barWidth = Math.min(slot * 0.62, 34);

  // Show every other date label when the bars get narrow.
  const labelEvery = slot < 34 ? 2 : 1;

  const yLine = (value: number) => MARGIN.top + plotHeight - (yMax > 0 ? (value / yMax) * plotHeight : 0);

  const empty = totalCount === 0;

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-200">Daily usage · last {days.length} days</h2>
        <p className="text-xs text-zinc-500">
          {formatUsd(totalUsed)} · {totalCount} {totalCount === 1 ? "generation" : "generations"} in the window
        </p>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Daily API usage for the last ${days.length} days: ${formatUsd(totalUsed)} across ${totalCount} generations`}
        className="w-full"
      >
        {/* Horizontal gridlines with dollar labels (0 / mid / max). */}
        {[0, yMax / 2, yMax].map((value, index) => (
          <g key={index}>
            <line
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={yLine(value)}
              y2={yLine(value)}
              stroke="currentColor"
              className="text-white/10"
              strokeWidth={1}
            />
            <text
              x={MARGIN.left - 6}
              y={yLine(value) + 3}
              textAnchor="end"
              className="fill-zinc-500 text-[9px]"
            >
              {formatUsd(value)}
            </text>
          </g>
        ))}

        {days.map((point, index) => {
          const barHeight = yMax > 0 ? (point.used / yMax) * plotHeight : 0;
          const x = MARGIN.left + index * slot + (slot - barWidth) / 2;
          const y = MARGIN.top + plotHeight - barHeight;
          const isToday = index === days.length - 1;
          return (
            <g key={point.day}>
              {/* Full-height hover target so thin bars are still easy to point at. */}
              <rect x={MARGIN.left + index * slot} y={MARGIN.top} width={slot} height={plotHeight} fill="transparent">
                <title>
                  {`${point.day} · ${formatUsd(point.used)} · ${point.count} ${point.count === 1 ? "generation" : "generations"}`}
                </title>
              </rect>
              {barHeight > 0 && (
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(barHeight, 2)}
                  rx={2}
                  className={isToday ? "fill-indigo-300" : "fill-indigo-500/70"}
                />
              )}
              {index % labelEvery === 0 && (
                <text x={x + barWidth / 2} y={HEIGHT - 6} textAnchor="middle" className="fill-zinc-500 text-[9px]">
                  {point.day.slice(5)}
                </text>
              )}
            </g>
          );
        })}

        {empty && (
          <text x={WIDTH / 2} y={MARGIN.top + plotHeight / 2} textAnchor="middle" className="fill-zinc-600 text-[11px]">
            No generations in the last {days.length} days
          </text>
        )}
      </svg>
    </section>
  );
}

/**
 * Round a chart maximum up to a human-friendly value (1/2/5 × 10^k) so
 * gridline labels read cleanly. Falls back to 1 when there is no spend.
 */
function niceCeiling(value: number): number {
  if (!(value > 0)) return 1;
  const exponent = Math.floor(Math.log10(value));
  const base = Math.pow(10, exponent);
  const scaled = value / base;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * base;
}
