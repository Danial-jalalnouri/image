import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { ERROR_CODES, MAX_IMAGE_BYTES, MAX_REQUEST_BODY_BYTES, STYLE_IDS, type ErrorCode, type GenerateResponse } from "@/lib/api";
import { ensureUser } from "@/lib/db";
import { clientKey, checkRateLimit } from "@/lib/rate-limit";
import { OpenRouterError, generateStyledImage } from "@/lib/openrouter";
import { getStyle } from "@/lib/styles";

/** Only real raster images are accepted — never scripts or HTML. */
const DATA_URL_PATTERN = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\r\n]+)$/;

const generateSchema = z.object({
  image: z
    .string()
    .max(MAX_REQUEST_BODY_BYTES, "Image is too large.")
    .refine((value) => DATA_URL_PATTERN.test(value), {
      message: "image must be a base64 data URL of a PNG, JPEG, or WebP image.",
    })
    .refine(
      (value) => {
        const base64 = value.split(",")[1] ?? "";
        return base64ToBytes(base64) <= MAX_IMAGE_BYTES;
      },
      { message: "Image is too large." },
    ),
  styleId: z.enum(STYLE_IDS, { error: "Please pick a valid style." }),
});

/** Size-accurate base64 length calculation (handles whitespace/newlines). */
function base64ToBytes(base64: string): number {
  const compact = base64.replace(/[\r\n]/g, "");
  const padding = compact.endsWith("==") ? 2 : compact.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((compact.length * 3) / 4) - padding);
}

function errorResponse(code: ErrorCode, message: string, status: number, headers?: HeadersInit) {
  const body: GenerateResponse = { ok: false, error: message, code };
  return NextResponse.json(body, { status, headers });
}

export async function POST(request: NextRequest) {
  // --- Authentication -------------------------------------------------------
  // Image generation costs real credits, so only signed-in users may call it.
  const { userId } = await auth();
  if (!userId) {
    return errorResponse("unauthorized", "Please sign in to generate images.", 401);
  }

  // --- Access control (Neon) ------------------------------------------------
  // First-time users are auto-provisioned as *pending members* and blocked
  // until an admin approves them in the database.
  let accessUser;
  try {
    const clerkUser = await currentUser();
    const email = clerkUser?.primaryEmailAddress?.emailAddress;
    if (!email) {
      return errorResponse("unauthorized", "Could not resolve your account. Please sign in again.", 401);
    }
    accessUser = await ensureUser({
      clerkUserId: userId,
      email,
      fullName: [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") || null,
    });
  } catch (error) {
    console.error("[generate] Database access check failed:", error);
    return errorResponse("upstream_error", "Could not verify your access. Please try again.", 500);
  }
  if (!accessUser.approved) {
    return errorResponse(
      "access_pending",
      "Your account is pending approval. Please ask an admin to grant you access.",
      403,
    );
  }

  // --- Rate limiting -------------------------------------------------------
  const limiter = checkRateLimit(clientKey(request.headers));
  if (!limiter.allowed) {
    return errorResponse(
      "rate_limited",
      "Too many requests. Please wait a moment and try again.",
      429,
      { "Retry-After": String(limiter.retryAfterSeconds) },
    );
  }

  // --- Body parsing (with hard size ceiling) -------------------------------
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_REQUEST_BODY_BYTES) {
    return errorResponse("too_large", "Image is too large.", 413);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse("bad_request", "Request body must be valid JSON.", 400);
  }

  // --- Validation -----------------------------------------------------------
  const parsed = generateSchema.safeParse(rawBody);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid request.";
    const code: ErrorCode = message.includes("too large") ? "too_large" : "bad_request";
    return errorResponse(code, message, code === "too_large" ? 413 : 400);
  }

  const style = getStyle(parsed.data.styleId)!;

  // --- Generation -----------------------------------------------------------
  try {
    const result = await generateStyledImage({
      imageDataUrl: parsed.data.image,
      prompt: style.prompt,
      signal: request.signal,
    });

    const body: GenerateResponse = {
      ok: true,
      image: result.image,
      note: result.note,
    };
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof OpenRouterError) {
      const status =
        ERROR_CODES.includes(error.code as ErrorCode)
          ? STATUS_BY_CODE[error.code as ErrorCode] ?? 502
          : 502;
      if (error.code === "not_configured") {
        // Keep the technical detail server-side; show the user something actionable.
        console.error("[generate] Configuration error:", error.message);
        return errorResponse(
          error.code,
          "Image generation is not configured on this server. Please contact the administrator.",
          status,
        );
      }
      return errorResponse(error.code as ErrorCode, error.message, status);
    }
    console.error("[generate] Unexpected error:", error);
    return errorResponse("upstream_error", "Something went wrong. Please try again.", 500);
  }
}

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  unauthorized: 401,
  bad_request: 400,
  too_large: 413,
  rate_limited: 429,
  access_pending: 403,
  not_configured: 503,
  upstream_error: 502,
  upstream_refused: 502,
  timeout: 504,
};
