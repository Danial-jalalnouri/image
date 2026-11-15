/**
 * Neon Postgres access layer.
 *
 * The `users` table is the source of truth for who may generate images:
 * every signed-in Clerk user is auto-provisioned here as a *pending member*
 * on first sight, and stays blocked until an admin approves them. Admins are
 * simply users with `role = 'admin'` in this table.
 */

import { neon } from "@neondatabase/serverless";

import type { UsageSnapshot } from "./limits";

/** Server-side user record as stored in Postgres. */
export type DbUser = {
  clerkUserId: string;
  email: string;
  fullName: string | null;
  role: "admin" | "member";
  approved: boolean;
  createdAt: string;
  approvedAt: string | null;
};

/** Client-safe view of a user (no internal bookkeeping columns). */
export type PublicUser = {
  clerkUserId: string;
  email: string;
  fullName: string | null;
  role: "admin" | "member";
  approved: boolean;
};

type Row = Record<string, unknown>;

/** Lazy singleton — avoids opening a client when the module is merely imported. */
let sqlFn: ReturnType<typeof neon> | null = null;

function sqlFnOrNull() {
  if (!sqlFn) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not configured.");
    }
    sqlFn = neon(url);
  }
  return sqlFn;
}

/** Tagged-template query returning plain row objects (the driver's union type narrowed). */
async function query(strings: TemplateStringsArray, ...values: unknown[]): Promise<Row[]> {
  const fn = sqlFnOrNull();
  return (await fn(strings, ...values)) as Row[];
}

function toDbUser(row: Row): DbUser {
  return {
    clerkUserId: String(row.clerk_user_id),
    email: String(row.email),
    fullName: row.full_name == null ? null : String(row.full_name),
    role: row.role === "admin" ? "admin" : "member",
    approved: Boolean(row.approved),
    createdAt: new Date(row.created_at as string).toISOString(),
    approvedAt: row.approved_at == null ? null : new Date(row.approved_at as string).toISOString(),
  };
}

function toPublicUser(user: DbUser): PublicUser {
  return {
    clerkUserId: user.clerkUserId,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    approved: user.approved,
  };
}

/**
 * Insert the user as a pending member if they have never been seen before;
 * otherwise keep their existing role/approval (never silently re-approves).
 * Returns the resulting row.
 */
export async function ensureUser(params: {
  clerkUserId: string;
  email: string;
  fullName?: string | null;
}): Promise<DbUser> {
  const result = await query`
    INSERT INTO users (clerk_user_id, email, full_name)
    VALUES (${params.clerkUserId}, ${params.email}, ${params.fullName ?? null})
    ON CONFLICT (clerk_user_id) DO UPDATE
      SET email = EXCLUDED.email,
          full_name = COALESCE(EXCLUDED.full_name, users.full_name)
    RETURNING *
  `;
  return toDbUser(result[0]);
}

/** Fetch a single user by Clerk id, or null. */
export async function getUser(clerkUserId: string): Promise<DbUser | null> {
  const result = await query`SELECT * FROM users WHERE clerk_user_id = ${clerkUserId} LIMIT 1`;
  return result[0] ? toDbUser(result[0]) : null;
}

/** All users, newest first. */
export async function listUsers(): Promise<PublicUser[]> {
  const result = await query`SELECT * FROM users ORDER BY created_at DESC`;
  return result.map((row) => toPublicUser(toDbUser(row)));
}

/** Approve or revoke a user's access. Returns the updated row, or null if absent. */
export async function setApproval(clerkUserId: string, approved: boolean): Promise<PublicUser | null> {
  const result = approved
    ? await query`UPDATE users SET approved = true, approved_at = now() WHERE clerk_user_id = ${clerkUserId} RETURNING *`
    : await query`UPDATE users SET approved = false, approved_at = null WHERE clerk_user_id = ${clerkUserId} RETURNING *`;
  return result[0] ? toPublicUser(toDbUser(result[0])) : null;
}

/** Promote or demote between 'admin' and 'member'. */
export async function setRole(clerkUserId: string, role: "admin" | "member"): Promise<PublicUser | null> {
  const result = await query`UPDATE users SET role = ${role} WHERE clerk_user_id = ${clerkUserId} RETURNING *`;
  return result[0] ? toPublicUser(toDbUser(result[0])) : null;
}

/**
 * How much the user has spent, per limit window.
 * Windows are calendar-based in UTC: `daily` since midnight UTC,
 * `weekly` since Monday 00:00 UTC, `total` over all time.
 */
export async function getSpendSummary(clerkUserId: string): Promise<UsageSnapshot> {
  const result = await query`
    SELECT
      COALESCE(SUM(cost_usd) FILTER (WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'), 0)::float8 AS daily_used,
      COALESCE(SUM(cost_usd) FILTER (WHERE created_at >= date_trunc('week', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'), 0)::float8 AS weekly_used,
      COALESCE(SUM(cost_usd), 0)::float8 AS total_used
    FROM generations
    WHERE clerk_user_id = ${clerkUserId}
  `;
  const row = result[0] ?? {};
  return {
    dailyUsed: Number(row.daily_used ?? 0),
    weeklyUsed: Number(row.weekly_used ?? 0),
    totalUsed: Number(row.total_used ?? 0),
  };
}

/** Record one billed generation. Call only after a successful upstream result. */
export async function logGeneration(params: {
  clerkUserId: string;
  styleId: string;
  costUsd: number;
}): Promise<void> {
  await query`
    INSERT INTO generations (clerk_user_id, style_id, cost_usd)
    VALUES (${params.clerkUserId}, ${params.styleId}, ${params.costUsd})
  `;
}
