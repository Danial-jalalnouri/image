import { NextResponse } from "next/server";

import { IDENTITY_PRESERVATION, STYLES } from "@/lib/styles";

/**
 * Serves the style registry as JSON. Used by the /how-it-works.html docs page
 * to render each style's prompt — always in sync with src/lib/styles.ts.
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      identity: IDENTITY_PRESERVATION,
      styles: STYLES.map((style) => ({
        id: style.id,
        name: style.name,
        emoji: style.emoji,
        tagline: style.tagline,
        prompt: style.prompt,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
