/**
 * Server-only client for OpenRouter image generation.
 *
 * Sends the user's photo plus a style prompt to the configured image model —
 * the `image_model` setting in the database, admin-editable at /admin, which
 * falls back to `google/gemini-3.1-flash-image` (Nano Banana 2) — and returns
 * the edited image as a base64 data URL.
 *
 * Two endpoint families are supported, picked automatically per model:
 * - chat/completions with `modalities: ["image","text"]` for omni image
 *   -editing models (Gemini "Nano Banana" family, GPT-5 image, …);
 * - the dedicated `POST /v1/images` Image API, which takes the photo as an
 *   `input_references` entry (MiniMax H3 Image, Seedream, Qwen-Image, Flux, …).
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

/** Minimal error shape shared by both endpoint families' responses. */
interface UpstreamErrorShape {
  error?: { message?: string; code?: number | string };
}

interface ChatCompletionResponse extends UpstreamErrorShape {
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
}

interface ImagesApiResponse extends UpstreamErrorShape {
  data?: Array<{ b64_json?: string; media_type?: string }>;
  usage?: {
    cost?: number;
    total_cost?: number;
  };
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
 * generated image as a data URL. The endpoint (chat/completions vs the
 * Image API) is resolved from the model's published capabilities.
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
  const endpoint = await resolveImageModelEndpoint(model);

  return endpoint === "images"
    ? generateViaImagesApi({ apiKey, baseUrl, model, imageDataUrl, prompt, signal })
    : generateViaChatCompletions({ apiKey, baseUrl, model, imageDataUrl, prompt, signal });
}

interface InternalCallOptions extends GenerateImageOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
}

function requestHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    // Attributed per OpenRouter recommendations.
    "HTTP-Referer": process.env.APP_URL?.trim() || "http://localhost:3000",
    "X-Title": "Portrait Studio",
  };
}

function requestSignal(signal?: AbortSignal): AbortSignal {
  // Image generation can take a while; give it a generous ceiling.
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000);
}

/** Maps network-level failures (abort, deadline, unreachable) to typed errors. */
function mapFetchFailure(error: unknown, signal?: AbortSignal): OpenRouterError {
  if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
    return new OpenRouterError("The request was aborted.", {
      status: 499,
      code: "timeout",
      retryable: true,
    });
  }
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return new OpenRouterError("Image generation timed out. Please try again.", {
      status: 504,
      code: "timeout",
      retryable: true,
    });
  }
  return new OpenRouterError("Could not reach the image generation service.", {
    status: 502,
    code: "upstream_error",
    retryable: true,
  });
}

async function parseResponse<T extends UpstreamErrorShape>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new OpenRouterError("The image service returned an unreadable response.", {
      status: 502,
      code: "upstream_error",
      retryable: true,
    });
  }
}

function extractCostUsd(usage: { cost?: number; total_cost?: number } | undefined): number | undefined {
  return typeof usage?.cost === "number"
    ? usage.cost
    : typeof usage?.total_cost === "number"
      ? usage.total_cost
      : undefined;
}

/** chat/completions with inline image output (the original path). */
async function generateViaChatCompletions({
  apiKey,
  baseUrl,
  model,
  imageDataUrl,
  prompt,
  signal,
}: InternalCallOptions): Promise<GenerationResult> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: requestHeaders(apiKey),
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
      signal: requestSignal(signal),
    });
  } catch (error) {
    throw mapFetchFailure(error, signal);
  }

  const payload = await parseResponse<ChatCompletionResponse>(response);
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

  return { image: imageUrl, note: extractText(message?.content) ?? undefined, costUsd: extractCostUsd(payload.usage) };
}

/**
 * The dedicated Image API (POST /v1/images): prompt + the user's photo as an
 * `input_references` entry. Used by models that are not served over
 * chat/completions (MiniMax H3 Image, Seedream, Flux, GPT-Image, …).
 */
async function generateViaImagesApi({
  apiKey,
  baseUrl,
  model,
  imageDataUrl,
  prompt,
  signal,
}: InternalCallOptions): Promise<GenerationResult> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/images`, {
      method: "POST",
      headers: requestHeaders(apiKey),
      body: JSON.stringify({
        model,
        prompt,
        // A single photo reference: "put THIS person in the scene".
        input_references: [{ type: "image_url", image_url: { url: imageDataUrl } }],
        n: 1,
      }),
      signal: requestSignal(signal),
    });
  } catch (error) {
    throw mapFetchFailure(error, signal);
  }

  const payload = await parseResponse<ImagesApiResponse>(response);
  if (!response.ok) {
    throw mapUpstreamError(response.status, payload);
  }

  const entry = payload.data?.find((item) => typeof item.b64_json === "string" && item.b64_json.length > 0);
  if (!entry?.b64_json) {
    throw new OpenRouterError(
      "The model did not return an image. Try a different photo or style.",
      { status: 502, code: "upstream_refused", retryable: true },
    );
  }

  const mediaType = /^image\//.test(entry.media_type ?? "") ? entry.media_type : "image/png";
  return {
    image: `data:${mediaType};base64,${entry.b64_json}`,
    costUsd: extractCostUsd(payload.usage),
  };
}

function mapUpstreamError(
  status: number,
  payload: UpstreamErrorShape,
): OpenRouterError {
  const detail = payload.error?.message ?? `Upstream responded with ${status}.`;

  // A model picked in the admin area that can't edit photos or an unknown id
  // both surface here. Say exactly what's wrong instead of echoing upstream jargon.
  if (/use the \/api\/v1\/images endpoint/i.test(detail) || /is an image generation model/i.test(detail)) {
    console.error("[openrouter] Incompatible image model configured:", detail);
    return new OpenRouterError(
      "The configured image model can't edit photos — it can't receive the user's photo. " +
        "An admin needs to pick an image-editing model (photo in → image out), such as google/gemini-3.1-flash-image.",
      { status: 502, code: "upstream_error" },
    );
  }
  if (/no endpoints found/i.test(detail)) {
    console.error("[openrouter] Unknown image model configured:", detail);
    return new OpenRouterError(
      "The configured image model id doesn't exist or has no active endpoints. An admin needs to correct it in the admin area.",
      { status: 502, code: "upstream_error" },
    );
  }

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

// ---------------------------------------------------------------------------
// Model catalogs — power admin model validation, suggestions, and endpoint
// routing. OpenRouter exposes two families:
// - /models: chat/completions models (a few can edit images inline);
// - /images/models: the dedicated Image API (68+ models, several of which
//   accept photo references and can therefore edit the user's photo).
// ---------------------------------------------------------------------------

/** Minimal model metadata used by the admin tooling. */
export interface OpenRouterModelInfo {
  id: string;
  name: string;
  inputModalities: string[];
  outputModalities: string[];
}

/** Which endpoint family serves a model. */
export type ImageModelEndpoint = "chat" | "images";

/** A model the app can use, with the endpoint it needs. */
export interface ImageEditModel {
  id: string;
  name: string;
  endpoint: ImageModelEndpoint;
}

interface CatalogResponse {
  data?: Array<{
    id?: string;
    name?: string;
    architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  }>;
}

const MODEL_CATALOG_TTL_MS = 10 * 60 * 1000;
let modelCatalogCache: { at: number; models: OpenRouterModelInfo[] } | null = null;
let imagesCatalogCache: { at: number; models: OpenRouterModelInfo[] } | null = null;

function parseCatalog(payload: CatalogResponse): OpenRouterModelInfo[] {
  return (payload.data ?? []).flatMap((model) => {
    if (typeof model.id !== "string") return [];
    return [
      {
        id: model.id,
        name: typeof model.name === "string" ? model.name : model.id,
        inputModalities: model.architecture?.input_modalities ?? [],
        outputModalities: model.architecture?.output_modalities ?? [],
      },
    ];
  });
}

async function fetchCatalog(
  path: "models" | "images/models",
  cache: { at: number; models: OpenRouterModelInfo[] } | null,
): Promise<{ models: OpenRouterModelInfo[] | null; nextCache: { at: number; models: OpenRouterModelInfo[] } | null }> {
  if (cache && Date.now() - cache.at < MODEL_CATALOG_TTL_MS) {
    return { models: cache.models, nextCache: cache };
  }
  const baseUrl = process.env.OPENROUTER_BASE_URL?.trim() || DEFAULT_BASE_URL;
  try {
    const response = await fetch(`${baseUrl}/${path}`, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return { models: null, nextCache: null };
    const payload = (await response.json()) as CatalogResponse;
    const models = parseCatalog(payload);
    return { models, nextCache: { at: Date.now(), models } };
  } catch {
    // A catalog outage must never block admins or generation.
    return { models: null, nextCache: null };
  }
}

/** The chat/completions catalog. Null when unreachable. */
async function fetchModelCatalog(): Promise<OpenRouterModelInfo[] | null> {
  const { models, nextCache } = await fetchCatalog("models", modelCatalogCache);
  modelCatalogCache = nextCache;
  return models;
}

/** The dedicated Image API catalog. Null when unreachable. */
async function fetchImagesCatalog(): Promise<OpenRouterModelInfo[] | null> {
  const { models, nextCache } = await fetchCatalog("images/models", imagesCatalogCache);
  imagesCatalogCache = nextCache;
  return models;
}

/**
 * Every model the app can use, across both endpoint families: image output
 * plus image input (the photo). Chat-capable models win when a model exists
 * in both catalogs. Auto-routers are excluded.
 */
export async function listImageEditModels(): Promise<ImageEditModel[]> {
  const [chat, images] = await Promise.all([fetchModelCatalog(), fetchImagesCatalog()]);
  const results = new Map<string, ImageEditModel>();
  if (chat) {
    for (const model of chat) {
      if (model.id.startsWith("openrouter/auto")) continue;
      if (!model.outputModalities.includes("image") || !model.inputModalities.includes("image")) continue;
      results.set(model.id.toLowerCase(), { id: model.id, name: model.name, endpoint: "chat" });
    }
  }
  if (images) {
    for (const model of images) {
      if (results.has(model.id.toLowerCase())) continue;
      if (!model.outputModalities.includes("image") || !model.inputModalities.includes("image")) continue;
      results.set(model.id.toLowerCase(), { id: model.id, name: model.name, endpoint: "images" });
    }
  }
  return [...results.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Which endpoint family serves this model id. Unknown ids (or unreachable
 * catalogs) default to chat/completions — the original behavior, which
 * fails with a mapped, actionable error.
 */
export async function resolveImageModelEndpoint(modelId: string): Promise<ImageModelEndpoint> {
  const lower = modelId.toLowerCase();
  const [chat, images] = await Promise.all([fetchModelCatalog(), fetchImagesCatalog()]);
  const chatEntry = chat?.find((model) => model.id.toLowerCase() === lower);
  if (chatEntry && chatEntry.outputModalities.includes("image") && chatEntry.inputModalities.includes("image")) {
    return "chat";
  }
  const imagesEntry = images?.find((model) => model.id.toLowerCase() === lower);
  if (imagesEntry && imagesEntry.inputModalities.includes("image")) {
    return "images";
  }
  return "chat";
}

/**
 * Human-readable reason the model id is unusable here, or null when it is
 * compatible — or when the catalogs are unavailable (fail open; a save is
 * never blocked by an OpenRouter outage).
 */
export async function validateImageModelId(modelId: string): Promise<string | null> {
  const [chat, images] = await Promise.all([fetchModelCatalog(), fetchImagesCatalog()]);
  if (!chat && !images) return null;

  const lower = modelId.toLowerCase();
  const chatEntry = chat?.find((model) => model.id.toLowerCase() === lower);
  const imagesEntry = images?.find((model) => model.id.toLowerCase() === lower);

  if (chatEntry) {
    if (!chatEntry.outputModalities.includes("image")) {
      return `"${chatEntry.name}" (${chatEntry.id}) cannot generate images at all, so it can't be used here.`;
    }
    if (!chatEntry.inputModalities.includes("image")) {
      return (
        `"${chatEntry.name}" (${chatEntry.id}) is a text-to-image model — it cannot receive the user's photo, ` +
        "which this app requires. Pick an image-editing model such as google/gemini-3.1-flash-image."
      );
    }
    return null;
  }

  if (imagesEntry) {
    if (!imagesEntry.inputModalities.includes("image")) {
      return (
        `"${imagesEntry.name}" (${imagesEntry.id}) only creates images from a text description — ` +
        "it can't use the user's photo, which this app requires."
      );
    }
    return null;
  }

  // Only reject as unknown when both catalogs were actually loaded.
  if (chat && images) {
    return `"${modelId}" is not in OpenRouter's model catalogs — check the exact id at openrouter.ai/models.`;
  }
  return null;
}
