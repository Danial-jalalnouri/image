import { NextResponse } from "next/server";

import { listStyles } from "@/lib/db";
import { composePrompt, IDENTITY_PRESERVATION } from "@/lib/styles";

/**
 * Serves the live style registry from the database. Used by the style picker
 * and the /how-it-works.html docs page. Only enabled styles are listed; the
 * full prompt is composed as scene text + the shared identity contract.
 */
export async function GET() {
  try {
    const styles = await listStyles();
    return NextResponse.json(
      {
        ok: true,
        identity: IDENTITY_PRESERVATION,
        styles: styles.map((style) => ({
          id: style.id,
          name: style.name,
          emoji: style.emoji,
          tagline: style.tagline,
          gradient: style.gradient,
          prompt: composePrompt(style.scenePrompt),
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[styles] Database error:", error);
    return NextResponse.json(
      { ok: false, error: "Could not load styles.", code: "upstream_error" },
      { status: 500 },
    );
  }
}
