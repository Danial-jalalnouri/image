import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { deleteStyle, updateStyle } from "@/lib/db";

const patchSchema = z.object({
  name: z.string().min(1, "Name is required.").max(60).optional(),
  tagline: z.string().max(120).optional(),
  emoji: z.string().min(1).max(8).optional(),
  gradient: z.string().max(120).optional(),
  scenePrompt: z.string().min(1, "Scene prompt is required.").max(4000).optional(),
  enabled: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/admin/styles/[id] — edit fields or enable/disable. */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be valid JSON.", code: "bad_request" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(rawBody);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid style.";
    return NextResponse.json({ ok: false, error: message, code: "bad_request" }, { status: 400 });
  }

  try {
    const style = await updateStyle(id, parsed.data);
    if (!style) {
      return NextResponse.json({ ok: false, error: "Style not found.", code: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, style });
  } catch (error) {
    console.error("[admin/styles] Database error:", error);
    return NextResponse.json({ ok: false, error: "Could not update the style.", code: "upstream_error" }, { status: 500 });
  }
}

/** DELETE /api/admin/styles/[id] — remove the style entirely. */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;

  try {
    const deleted = await deleteStyle(id);
    if (!deleted) {
      return NextResponse.json({ ok: false, error: "Style not found.", code: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("[admin/styles] Database error:", error);
    return NextResponse.json({ ok: false, error: "Could not delete the style.", code: "upstream_error" }, { status: 500 });
  }
}
