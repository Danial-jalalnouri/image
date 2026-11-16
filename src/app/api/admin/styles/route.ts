import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { createStyle, listStyles } from "@/lib/db";

/** GET /api/admin/styles — every style, including disabled ones. */
export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  try {
    const styles = await listStyles({ includeDisabled: true });
    return NextResponse.json({ ok: true, styles });
  } catch (error) {
    console.error("[admin/styles] Database error:", error);
    return NextResponse.json({ ok: false, error: "Could not load styles.", code: "upstream_error" }, { status: 500 });
  }
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

const createSchema = z.object({
  id: z
    .string()
    .regex(ID_PATTERN, "Style id must be 1-40 lowercase letters, digits, or hyphens (no leading hyphen)."),
  name: z.string().min(1, "Name is required.").max(60),
  tagline: z.string().max(120).optional().default(""),
  emoji: z.string().min(1).max(8).optional().default("🎨"),
  gradient: z.string().max(120).optional().default("from-indigo-500/80 to-violet-600/80"),
  scenePrompt: z.string().min(1, "Scene prompt is required.").max(4000),
  enabled: z.boolean().optional().default(true),
});

/** POST /api/admin/styles — add a new style. */
export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be valid JSON.", code: "bad_request" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(rawBody);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid style.";
    return NextResponse.json({ ok: false, error: message, code: "bad_request" }, { status: 400 });
  }

  try {
    const style = await createStyle(parsed.data);
    return NextResponse.json({ ok: true, style }, { status: 201 });
  } catch (error) {
    // Unique-violation on the id primary key.
    if (String((error as { code?: string }).code) === "23505") {
      return NextResponse.json(
        { ok: false, error: `A style with id "${parsed.data.id}" already exists.`, code: "conflict" },
        { status: 409 },
      );
    }
    console.error("[admin/styles] Database error:", error);
    return NextResponse.json({ ok: false, error: "Could not create the style.", code: "upstream_error" }, { status: 500 });
  }
}
