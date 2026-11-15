/** Shared runtime constants for the app. */

/** OpenRouter model used for image generation (Nano Banana 2). */
export const DEFAULT_MODEL = "google/gemini-3.1-flash-image";

/** Hard cap on the decoded image size the API accepts, in bytes. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Hard cap on the serialized request body, in bytes (data URL + JSON overhead). */
export const MAX_REQUEST_BODY_BYTES = 14 * 1024 * 1024;

/** Largest source photo a user may pick, before client-side downscaling, in bytes. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Generated images above this dimension get downscaled client-side. */
export const MAX_IMAGE_DIMENSION = 2048;

/** Rate limiting: a sliding window per client. */
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX_REQUESTS = 8;
