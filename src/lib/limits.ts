/**
 * Per-user spending limits for image generation.
 *
 * Windows are calendar-based in UTC:
 * - `daily`  resets at midnight UTC
 * - `weekly` resets on Monday 00:00 UTC
 * - `total`  is the lifetime budget and never resets
 *
 * Imported by both the server (enforcement) and the client (display),
 * so keep this module free of server-only dependencies.
 */

/** Spend limits per user, in US dollars. */
export const SPEND_LIMITS = {
  daily: 1,
  weekly: 2,
  total: 3,
} as const;

export type LimitKind = keyof typeof SPEND_LIMITS;

/** How much a user has spent, tracked per limit window. */
export type UsageSnapshot = {
  dailyUsed: number;
  weeklyUsed: number;
  totalUsed: number;
};

/** Billed usage of the whole API within one window (all users combined). */
export type UsageWindow = {
  used: number;
  count: number;
};

/** Global (all-user) usage per window, for the admin page. */
export type GlobalUsage = {
  daily: UsageWindow;
  weekly: UsageWindow;
  total: UsageWindow;
};

/**
 * Cost recorded per generation when OpenRouter does not report the exact
 * price. Deliberately generous (~2x a typical generation) so missing
 * telemetry can never let a user overspend.
 */
export const ESTIMATED_COST_PER_GENERATION = 0.01;

/**
 * Returns the strictest limit that has been reached, or null if the user
 * may still generate. `total` wins when several limits are exhausted.
 */
export function findHitLimit(usage: UsageSnapshot): LimitKind | null {
  if (usage.totalUsed >= SPEND_LIMITS.total) return "total";
  if (usage.weeklyUsed >= SPEND_LIMITS.weekly) return "weekly";
  if (usage.dailyUsed >= SPEND_LIMITS.daily) return "daily";
  return null;
}

export function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

const RESET_HINT: Record<LimitKind, string> = {
  daily: "Your daily allowance resets at midnight UTC.",
  weekly: "Your weekly allowance resets on Monday (UTC).",
  total: "This is your lifetime budget for the app.",
};

/** User-facing message for an exhausted limit. */
export function budgetMessage(kind: LimitKind): string {
  const label = kind === "daily" ? "daily" : kind === "weekly" ? "weekly" : "total";
  return `You've reached your ${label} spending limit of ${formatUsd(SPEND_LIMITS[kind])}. ${RESET_HINT[kind]}`;
}
