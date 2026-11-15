import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ensureUser, getSpendSummary, type PublicUser } from "@/lib/db";
import type { UsageSnapshot } from "@/lib/limits";

/**
 * Returns the signed-in user's access status.
 * Auto-provisions their row as a pending member on first sight, so the
 * client can immediately show "ask an admin for access" for new users.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Not signed in.", code: "unauthorized" }, { status: 401 });
  }

  try {
    // Look up via Backend API to get email/name for provisioning.
    const { currentUser } = await import("@clerk/nextjs/server");
    const clerkUser = await currentUser();
    const email = clerkUser?.primaryEmailAddress?.emailAddress;
    if (!email) {
      return NextResponse.json(
        { ok: false, error: "Could not resolve your account.", code: "unauthorized" },
        { status: 401 },
      );
    }

    const user = await ensureUser({
      clerkUserId: userId,
      email,
      fullName: [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") || null,
    });

    // Usage is best-effort: a billing hiccup should not look like an access denial.
    let usage: UsageSnapshot | undefined;
    try {
      usage = await getSpendSummary(userId);
    } catch (usageError) {
      console.error("[me] Usage lookup failed:", usageError);
    }

    const body: {
      ok: true;
      access: boolean;
      role: PublicUser["role"];
      email: string;
      fullName: string | null;
      usage?: UsageSnapshot;
    } = {
      ok: true,
      access: user.approved,
      role: user.role,
      email: user.email,
      fullName: user.fullName,
      usage,
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error("[me] Database error:", error);
    return NextResponse.json(
      { ok: false, error: "Could not load your access status.", code: "upstream_error" },
      { status: 500 },
    );
  }
}
