/**
 * Shared API contract between the client and the /api/generate route.
 * Keeping this in one place prevents client/server drift.
 */

import { DEFAULT_SPEND_LIMITS, type LimitSet, type UsageSnapshot } from "./limits";
import { STYLES } from "./styles";

/** Re-exported so consumers can import everything API-related from one module. */
export { MAX_IMAGE_BYTES, MAX_REQUEST_BODY_BYTES } from "./constants";
export { DEFAULT_SPEND_LIMITS, type LimitSet, type UsageSnapshot };

/** Accepted image MIME types (mirrored on client upload validation). */
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Zod-friendly list, derived from the exported constant. */export const ACCEPTED_IMAGE_TYPES_LIST = [...ACCEPTED_IMAGE_TYPES] as [string, ...string[]];

export type GenerateRequest = {
  /** Data URL of the user's photo (`data:image/...;base64,...`). */
  image: string;
  /** One of the style ids from the registry. */
  styleId: string;
};

export type GenerateResponse =
  | { ok: true; image: string; note?: string; usage?: UsageSnapshot; limits?: LimitSet }
  | { ok: false; error: string; code: ErrorCode; usage?: UsageSnapshot; limits?: LimitSet };

export const ERROR_CODES = [
  "unauthorized",
  "bad_request",
  "too_large",
  "rate_limited",
  "access_pending",
  "budget_exhausted",
  "not_configured",
  "upstream_error",
  "upstream_refused",
  "timeout",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Valid style ids, derived from the registry so they can never drift. */
export const STYLE_IDS = STYLES.map((style) => style.id) as [string, ...string[]];
