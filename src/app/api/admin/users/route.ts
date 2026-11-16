import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getUser, getGlobalUsage, listUsers, setApproval, setRole } from "@/lib/db";

/** Admin-only guard: the caller must exist in the DB with role = 'admin'. */
async function requireAdmin() {
  const { userId } = await auth();
  if (!userId) {
    return { error: NextResponse.json({ ok: false, error: "Please sign in.", code: "unauthorized" }, { status: 401 }) };
  }
  let admin;
  try {
    admin = await getUser(userId);
  } catch (error) {
    console.error("[admin/users] Database error:", error);
    return { error: NextResponse.json({ ok: false, error: "Could not verify your role.", code: "upstream_error" }, { status: 500 }) };
  }
  if (!admin || admin.role !== "admin") {
    return { error: NextResponse.json({ ok: false, error: "Admin access required.", code: "forbidden" }, { status: 403 }) };
  }
  return { userId };
}

/** GET /api/admin/users — list every user plus global API usage for the admin page. */
export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  try {
    const users = await listUsers();
    const usage = await getGlobalUsage();
    return NextResponse.json({ ok: true, users, usage });
  } catch (error) {
    console.error("[admin/users] Database error:", error);
    return NextResponse.json({ ok: false, error: "Could not load users.", code: "upstream_error" }, { status: 500 });
  }
}

const patchSchema = z.object({
  clerkUserId: z.string().min(1),
  action: z.enum(["approve", "revoke", "makeAdmin", "removeAdmin"]),
});

/** PATCH /api/admin/users — approve/revoke access, grant/remove admin role. */
export async function PATCH(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be valid JSON.", code: "bad_request" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request.", code: "bad_request" }, { status: 400 });
  }

  const { clerkUserId, action } = parsed.data;

  try {
    // An admin should not be able to demote themselves and lock everyone out.
    if ((action === "removeAdmin" || action === "revoke") && clerkUserId === guard.userId) {
      return NextResponse.json(
        { ok: false, error: "You cannot change your own admin role or revoke your own access.", code: "bad_request" },
        { status: 400 },
      );
    }

    const user =
      action === "approve"
        ? await setApproval(clerkUserId, true)
        : action === "revoke"
          ? await setApproval(clerkUserId, false)
          : action === "makeAdmin"
            ? await setRole(clerkUserId, "admin")
            : await setRole(clerkUserId, "member");

    if (!user) {
      return NextResponse.json({ ok: false, error: "User not found.", code: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, user });
  } catch (error) {
    console.error("[admin/users] Database error:", error);
    return NextResponse.json({ ok: false, error: "Could not update the user.", code: "upstream_error" }, { status: 500 });
  }
}
