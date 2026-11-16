/**
 * Shared admin-only guard for API routes.
 *
 * The caller must be signed in AND exist in the Neon users table with
 * role = 'admin'. Admin status is always re-checked server-side; it is
 * never trusted from the client.
 */

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getUser } from "./db";

export async function requireAdmin(): Promise<
  { error: NextResponse; userId?: undefined } | { error?: undefined; userId: string }
> {
  const { userId } = await auth();
  if (!userId) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Please sign in.", code: "unauthorized" },
        { status: 401 },
      ),
    };
  }
  let admin;
  try {
    admin = await getUser(userId);
  } catch (error) {
    console.error("[admin] Database error:", error);
    return {
      error: NextResponse.json(
        { ok: false, error: "Could not verify your role.", code: "upstream_error" },
        { status: 500 },
      ),
    };
  }
  if (!admin || admin.role !== "admin") {
    return {
      error: NextResponse.json(
        { ok: false, error: "Admin access required.", code: "forbidden" },
        { status: 403 },
      ),
    };
  }
  return { userId };
}
