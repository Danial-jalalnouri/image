import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { getImageModel, getLimits, setImageModel, setLimits } from "@/lib/db";

/** GET /api/admin/settings — the current spend limits and image model. */
export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  try {
    const [limits, imageModel] = await Promise.all([getLimits(), getImageModel()]);
    return NextResponse.json({ ok: true, limits, imageModel });
  } catch (error) {
    console.error("[admin/settings] Database error:", error);
    return NextResponse.json(
      { ok: false, error: "Could not load settings.", code: "upstream_error" },
      { status: 500 },
    );
  }
}

const limitsSchema = z.object({
  daily: z.number().min(0).max(1000),
  weekly: z.number().min(0).max(1000),
  total: z.number().min(0).max(1000),
});

/** Matches OpenRouter model ids such as "google/gemini-3.1-flash-image". */
const modelSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(3, "Model id is too short.")
      .max(120, "Model id is too long.")
      .regex(
        /^[a-z0-9][a-z0-9._/-]*\/[a-z0-9][a-z0-9._:-]*$/i,
        'Model id must look like "vendor/model" — e.g. google/gemini-3.1-flash-image.',
      ),
  );

/** PATCH /api/admin/settings — update the spend limits or the image model. */
export async function PATCH(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be valid JSON.", code: "bad_request" }, { status: 400 });
  }

  // The image model has its own branch so the admin can save either setting
  // without touching the other.
  if (rawBody !== null && typeof rawBody === "object" && "imageModel" in rawBody) {
    const parsed = modelSchema.safeParse((rawBody as { imageModel: unknown }).imageModel);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid model id.";
      return NextResponse.json({ ok: false, error: message, code: "bad_request" }, { status: 400 });
    }
    try {
      const imageModel = await setImageModel(parsed.data);
      return NextResponse.json({ ok: true, imageModel });
    } catch (error) {
      console.error("[admin/settings] Database error:", error);
      return NextResponse.json(
        { ok: false, error: "Could not save the image model.", code: "upstream_error" },
        { status: 500 },
      );
    }
  }

  const parsed = limitsSchema.safeParse(rawBody);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path?.[0] ?? "";
    const message = field
      ? `Invalid ${String(field)} limit: ${issue?.message ?? "must be a number between 0 and 1000"}.`
      : "Invalid limits.";
    return NextResponse.json({ ok: false, error: message, code: "bad_request" }, { status: 400 });
  }

  try {
    const limits = await setLimits(parsed.data);
    return NextResponse.json({ ok: true, limits });
  } catch (error) {
    console.error("[admin/settings] Database error:", error);
    return NextResponse.json(
      { ok: false, error: "Could not save settings.", code: "upstream_error" },
      { status: 500 },
    );
  }
}
