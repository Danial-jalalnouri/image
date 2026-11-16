import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { getLimits, setLimits } from "@/lib/db";

/** GET /api/admin/settings — the current spend limits. */
export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  try {
    const limits = await getLimits();
    return NextResponse.json({ ok: true, limits });
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

/** PATCH /api/admin/settings — update the spend limits (applies to every user). */
export async function PATCH(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be valid JSON.", code: "bad_request" }, { status: 400 });
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
