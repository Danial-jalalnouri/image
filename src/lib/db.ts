/**
 * Neon Postgres access layer.
 *
 * The `users` table is the source of truth for who may generate images:
 * every signed-in Clerk user is auto-provisioned here as a *pending member*
 * on first sight, and stays blocked until an admin approves them. Admins are
 * simply users with `role = 'admin'` in this table.
 */

import { neon } from "@neondatabase/serverless";

import { DEFAULT_SPEND_LIMITS, type GlobalUsage, type LimitSet, type UsageSnapshot } from "./limits";
import { DEFAULT_STYLES, type StyleDefinition } from "./styles";

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

/**
 * The effective spend limits. Values come from the `settings` table
 * (editable by admins); any missing/invalid key falls back to
 * DEFAULT_SPEND_LIMITS, so this never throws on partial data.
 */
export async function getLimits(): Promise<LimitSet> {
  const result = await query`SELECT key, value FROM settings WHERE key LIKE 'limit_%'`;
  const parsed = { ...DEFAULT_SPEND_LIMITS };
  for (const row of result) {
    const key = String(row.key);
    const value = Number(row.value);
    if (!Number.isFinite(value) || value < 0) continue;
    if (key === "limit_daily") parsed.daily = value;
    else if (key === "limit_weekly") parsed.weekly = value;
    else if (key === "limit_total") parsed.total = value;
  }
  return parsed;
}

/** Persist all three limits (rounded to cents). Returns the stored values. */
export async function setLimits(limits: LimitSet): Promise<LimitSet> {
  const round = (value: number) => Number(value.toFixed(2));
  const result = await query`
    INSERT INTO settings (key, value)
    VALUES
      ('limit_daily', ${round(limits.daily).toFixed(2)}),
      ('limit_weekly', ${round(limits.weekly).toFixed(2)}),
      ('limit_total', ${round(limits.total).toFixed(2)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    RETURNING key, value
  `;
  const stored = { ...DEFAULT_SPEND_LIMITS };
  for (const row of result) {
    const key = String(row.key);
    const value = Number(row.value);
    if (key === "limit_daily") stored.daily = value;
    else if (key === "limit_weekly") stored.weekly = value;
    else if (key === "limit_total") stored.total = value;
  }
  return stored;
}

/**
 * Global usage across all users, per limit window (same UTC calendar
 * windows as getSpendSummary): dollars billed and generation count.
 */
export async function getGlobalUsage(): Promise<GlobalUsage> {
  const result = await query`
    SELECT
      COALESCE(SUM(cost_usd) FILTER (WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'), 0)::float8 AS daily_used,
      COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')::int AS daily_count,
      COALESCE(SUM(cost_usd) FILTER (WHERE created_at >= date_trunc('week', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'), 0)::float8 AS weekly_used,
      COUNT(*) FILTER (WHERE created_at >= date_trunc('week', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')::int AS weekly_count,
      COALESCE(SUM(cost_usd), 0)::float8 AS total_used,
      COUNT(*)::int AS total_count
    FROM generations
  `;
  const row = result[0] ?? {};
  return {
    daily: { used: Number(row.daily_used ?? 0), count: Number(row.daily_count ?? 0) },
    weekly: { used: Number(row.weekly_used ?? 0), count: Number(row.weekly_count ?? 0) },
    total: { used: Number(row.total_used ?? 0), count: Number(row.total_count ?? 0) },
  };
}

// ---------------------------------------------------------------------------
// Styles (live registry in the styles table, managed by admins at /admin)
// ---------------------------------------------------------------------------

/** Full style row as stored in Postgres. */
export type StyleRecord = StyleDefinition & {
  scenePrompt: string;
  enabled: boolean;
  sortOrder: number;
};

function toStyleRecord(row: Row): StyleRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    tagline: String(row.tagline ?? ""),
    emoji: String(row.emoji ?? "🎨"),
    gradient: String(row.gradient ?? "from-indigo-500/80 to-violet-600/80"),
    scenePrompt: String(row.scene_prompt ?? ""),
    enabled: Boolean(row.enabled),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

/** Lazily seed the styles table once per process when it is empty. */
let stylesSeedPromise: Promise<void> | null = null;

function ensureStylesSeeded(): Promise<void> {
  if (!stylesSeedPromise) {
    stylesSeedPromise = (async () => {
      const result = await query`SELECT count(*)::int AS n FROM styles`;
      if (Number(result[0]?.n ?? 0) > 0) return;
      for (const [index, style] of DEFAULT_STYLES.entries()) {
        await query`
          INSERT INTO styles (id, name, tagline, emoji, gradient, scene_prompt, enabled, sort_order)
          VALUES (${style.id}, ${style.name}, ${style.tagline}, ${style.emoji}, ${style.gradient}, ${style.scenePrompt}, true, ${index})
          ON CONFLICT (id) DO NOTHING
        `;
      }
    })().catch((error) => {
      // Allow a later request to retry seeding instead of caching the failure.
      stylesSeedPromise = null;
      throw error;
    });
  }
  return stylesSeedPromise;
}

/** All styles, ordered. Admins pass includeDisabled=true to see everything. */
export async function listStyles(options?: { includeDisabled?: boolean }): Promise<StyleRecord[]> {
  await ensureStylesSeeded();
  const result = options?.includeDisabled
    ? await query`SELECT * FROM styles ORDER BY sort_order, id`
    : await query`SELECT * FROM styles WHERE enabled = true ORDER BY sort_order, id`;
  return result.map(toStyleRecord);
}

/** One style by id (enabled or not), or null. */
export async function getStyleById(id: string): Promise<StyleRecord | null> {
  await ensureStylesSeeded();
  const result = await query`SELECT * FROM styles WHERE id = ${id} LIMIT 1`;
  return result[0] ? toStyleRecord(result[0]) : null;
}

export type NewStyle = StyleDefinition & { scenePrompt: string };

/** Create a style. Throws on duplicate id (primary key). */
export async function createStyle(style: NewStyle & { enabled?: boolean; sortOrder?: number }): Promise<StyleRecord> {
  await ensureStylesSeeded();
  let sortOrder = style.sortOrder;
  if (sortOrder == null) {
    const maxResult = await query`SELECT COALESCE(MAX(sort_order), -1)::int AS max FROM styles`;
    sortOrder = Number(maxResult[0]?.max ?? -1) + 1;
  }
  const result = await query`
    INSERT INTO styles (id, name, tagline, emoji, gradient, scene_prompt, enabled, sort_order)
    VALUES (${style.id}, ${style.name}, ${style.tagline ?? ""}, ${style.emoji ?? "🎨"}, ${style.gradient ?? "from-indigo-500/80 to-violet-600/80"}, ${style.scenePrompt}, ${style.enabled ?? true}, ${sortOrder})
    RETURNING *
  `;
  return toStyleRecord(result[0]);
}

/** Update any subset of a style's editable fields. Returns null if absent. */
export async function updateStyle(
  id: string,
  patch: Partial<Pick<StyleRecord, "name" | "tagline" | "emoji" | "gradient" | "scenePrompt" | "enabled">>,
): Promise<StyleRecord | null> {
  const current = await getStyleById(id);
  if (!current) return null;
  const next = {
    name: patch.name ?? current.name,
    tagline: patch.tagline ?? current.tagline,
    emoji: patch.emoji ?? current.emoji,
    gradient: patch.gradient ?? current.gradient,
    scenePrompt: patch.scenePrompt ?? current.scenePrompt,
    enabled: patch.enabled ?? current.enabled,
  };
  const result = await query`
    UPDATE styles
    SET name = ${next.name},
        tagline = ${next.tagline},
        emoji = ${next.emoji},
        gradient = ${next.gradient},
        scene_prompt = ${next.scenePrompt},
        enabled = ${next.enabled},
        updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return result[0] ? toStyleRecord(result[0]) : null;
}

/** Delete a style. Returns true when a row was removed. */
export async function deleteStyle(id: string): Promise<boolean> {
  const result = await query`DELETE FROM styles WHERE id = ${id} RETURNING id`;
  return result.length > 0;
}
