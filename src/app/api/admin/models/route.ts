import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { listImageEditModels } from "@/lib/openrouter";

/**
 * GET /api/admin/models — OpenRouter models this app can actually use:
 * image-editing models that accept a photo and return an image over
 * chat/completions. Powers the suggestion list on the admin model card.
 * Suggestions are a nice-to-have — an empty list never surfaces as an error.
 */
export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  try {
    const models = await listImageEditModels();
    return NextResponse.json(
      { ok: true, models },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[admin/models] OpenRouter error:", error);
    return NextResponse.json({ ok: true, models: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}
