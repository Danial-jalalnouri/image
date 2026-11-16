/**
 * Server-only client for OpenRouter image generation.
 *
 * Sends the user's photo plus a style prompt to the configured image model —
 * the `image_model` setting in the database, admin-editable at /admin, which
 * falls back to `google/gemini-3.1-flash-image` (Nano Banana 2) — and returns
 * the edited image inline as a base64 data URL.
 *
 * NEVER import this from client components — it depends on server env vars
 * and the database.
 */

import { getImageModel } from "./db";

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

/** Result of a successful generation. */
export interface GenerationResult {
  /** Data URL of the generated image (data:image/...;base64,...). */
  image: string;
  /** Any commentary the model returned alongside the image. */
  note?: string;
  /** Exact USD cost reported by OpenRouter, when usage accounting is available. */
  costUsd?: number;
}

/** Structured error thrown by the client, mapped to API error codes upstream. */
export class OpenRouterError extends Error {
  readonly status: number;
  /** Machine-readable code shared with the client API contract. */
  readonly code: string;
  readonly retryable: boolean;

  constructor(message: string, options: { status: number; code: string; retryable?: boolean }) {
    super(message);
    this.name = "OpenRouterError";
    this.status = options.status;
    this.code = options.code;
    this.retryable = options.retryable ?? false;
  }
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
      images?: Array<{ type?: string; image_url?: { url?: string } }>;
    };
    finish_reason?: string;
  }>;
  usage?: {
    cost?: number;
    total_cost?: number;
  };
  error?: { message?: string; code?: number | string };
}

type MessageContent = Exclude<
  NonNullable<NonNullable<ChatCompletionResponse["choices"]>[number]["message"]>["content"],
  undefined
>;

export interface GenerateImageOptions {
  /** The user's photo as a data URL. */
  imageDataUrl: string;
  /** Style instruction sent alongside the photo. */
  prompt: string;
  /** Abort when the caller's request is cancelled. */
  signal?: AbortSignal;
}

/**
 * Sends the user's photo + a style prompt to OpenRouter and returns the
 * generated image as a data URL.
 */
export async function generateStyledImage({
  imageDataUrl,
  prompt,
  signal,
}: GenerateImageOptions): Promise<GenerationResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new OpenRouterError(
      "OPENROUTER_API_KEY is not configured on the server.",
      { status: 500, code: "not_configured" },
    );
  }

  const baseUrl = process.env.OPENROUTER_BASE_URL?.trim() || DEFAULT_BASE_URL;
  // The model is database-driven (admin-editable at /admin). A DB failure
  // surfaces as upstream_error via the caller's catch — fail closed rather
  // than silently generating with a stale default.
  const model = await getImageModel();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // Attributed per OpenRouter recommendations.
        "HTTP-Referer": process.env.APP_URL?.trim() || "http://localhost:3000",
        "X-Title": "Portrait Studio",
      },
      body: JSON.stringify({
        model,
        // Ask for image output in addition to text.
        modalities: ["image", "text"],
        // Ask OpenRouter to bill and report the exact cost of this call.
        usage: { include: true },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
      }),
      // Image generation can take a while; give it a generous ceiling.
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
    });
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw new OpenRouterError("The request was aborted.", {
        status: 499,
        code: "timeout",
        retryable: true,
      });
    }
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new OpenRouterError("Image generation timed out. Please try again.", {
        status: 504,
        code: "timeout",
        retryable: true,
      });
    }
    throw new OpenRouterError("Could not reach the image generation service.", {
      status: 502,
      code: "upstream_error",
      retryable: true,
    });
  }

  let payload: ChatCompletionResponse;
  try {
    payload = (await response.json()) as ChatCompletionResponse;
  } catch {
    throw new OpenRouterError("The image service returned an unreadable response.", {
      status: 502,
      code: "upstream_error",
      retryable: true,
    });
  }

  if (!response.ok) {
    throw mapUpstreamError(response.status, payload);
  }

  const message = payload.choices?.[0]?.message;
  const imageUrl = message?.images?.find((img) => img.image_url?.url)?.image_url?.url;

  if (!imageUrl) {
    const note = extractText(message?.content);
    // The model responded with text but no image — usually a safety refusal
    // or an unsupported input. Surface the model's own explanation when present.
    throw new OpenRouterError(
      note
        ? `The model could not generate an image: ${note}`
        : "The model did not return an image. Try a different photo or style.",
      { status: 502, code: "upstream_refused", retryable: true },
    );
  }

  const costUsd =
    typeof payload.usage?.cost === "number"
      ? payload.usage.cost
      : typeof payload.usage?.total_cost === "number"
        ? payload.usage.total_cost
        : undefined;

  return { image: imageUrl, note: extractText(message?.content) ?? undefined, costUsd };
}

function mapUpstreamError(
  status: number,
  payload: ChatCompletionResponse,
): OpenRouterError {
  const detail = payload.error?.message ?? `Upstream responded with ${status}.`;
  switch (status) {
    case 401:
    case 403:
      return new OpenRouterError(`Authentication with the image service failed: ${detail}`, {
        status: 502,
        code: "not_configured",
      });
    case 402:
      return new OpenRouterError("The image service account is out of credits.", {
        status: 502,
        code: "not_configured",
      });
    case 429:
      return new OpenRouterError("The image service is rate limited. Please try again shortly.", {
        status: 429,
        code: "rate_limited",
        retryable: true,
      });
    case 408:
      return new OpenRouterError("Image generation timed out upstream.", {
        status: 504,
        code: "timeout",
        retryable: true,
      });
    default:
      return new OpenRouterError(`Image generation failed: ${detail}`, {
        status: 502,
        code: "upstream_error",
        retryable: status >= 500,
      });
  }
}

function extractText(content: MessageContent | undefined): string | null {
  if (!content) return null;
  if (typeof content === "string") return content.trim() || null;
  const text = content
    .filter((part): part is { type?: string; text?: string } => part.type === "text" && Boolean(part.text))
    .map((part) => part.text ?? "")
    .join(" ")
    .trim();
  return text || null;
}
