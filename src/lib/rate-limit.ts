/**
 * Minimal fixed-window rate limiter.
 *
 * Deliberately in-memory: keeps the app dependency-free and works for a single
 * instance. If you scale horizontally, swap `checkRateLimit` for Redis or your
 * platform's edge rate limiting — the call-site contract stays the same.
 */

import { RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS } from "./constants";

interface Bucket {
  /** Timestamps (ms) of accepted requests inside the current window. */
  hits: number[];
}

const buckets = new Map<string, Bucket>();

/** Periodically drop stale buckets so the map cannot grow unbounded. */
const SWEEP_INTERVAL_MS = 5 * 60_000;
let lastSweep = Date.now();

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the client may retry (only meaningful when blocked). */
  retryAfterSeconds: number;
}

export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now();

  if (now - lastSweep > SWEEP_INTERVAL_MS) {
    lastSweep = now;
    for (const [bucketKey, bucket] of buckets) {
      bucket.hits = bucket.hits.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
      if (bucket.hits.length === 0) buckets.delete(bucketKey);
    }
  }

  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (bucket.hits.length >= RATE_LIMIT_MAX_REQUESTS) {
    buckets.set(key, bucket);
    const oldest = bucket.hits[0];
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000)),
    };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Best-effort client identity from proxy headers, falling back to a wildcard. */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "anonymous";
}
