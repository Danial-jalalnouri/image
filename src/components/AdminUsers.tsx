"use client";

import { useCallback, useEffect, useState } from "react";

import { formatUsd, type GlobalUsage, type LimitSet } from "@/lib/limits";

type AdminUser = {
  clerkUserId: string;
  email: string;
  fullName: string | null;
  role: "admin" | "member";
  approved: boolean;
};

type ListResponse =
  | { ok: true; users: AdminUser[]; usage?: GlobalUsage; limits?: LimitSet; imageModel?: string }
  | { ok: false; error: string; code: string };
type PatchResponse = { ok: true; user: AdminUser } | { ok: false; error: string; code: string };
type MeResponse =
  | { ok: true; access: boolean; role: "admin" | "member"; email: string; fullName: string | null }
  | { ok: false; error: string; code: string };

type Action = "approve" | "revoke" | "makeAdmin" | "removeAdmin";

/**
 * Full-page admin area: approve/revoke access and manage admin roles.
 * Checks the signed-in user's role via /api/me; non-admins see a notice.
 * The /api/admin/users endpoints re-check admin rights server-side.
 */
export function AdminUsers() {
  const [roleState, setRoleState] = useState<"checking" | "member" | "admin">("checking");
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [usage, setUsage] = useState<GlobalUsage | null>(null);
  const [limits, setLimits] = useState<LimitSet | null>(null);
  const [imageModel, setImageModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/admin/users");
      const payload = (await response.json()) as ListResponse;
      if (!payload.ok) {
        setError(payload.error);
        return;
      }
      setUsers(payload.users);
      setUsage(payload.usage ?? null);
      setLimits(payload.limits ?? null);
      setImageModel(payload.imageModel ?? null);
    } catch {
      setError("Could not load users. Is the database configured?");
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/me");
        const payload = (await response.json()) as MeResponse;
        setRoleState(payload.ok && payload.role === "admin" ? "admin" : "member");
      } catch {
        setRoleState("member");
      }
    })();
  }, []);

  useEffect(() => {
    if (roleState === "admin") void load();
  }, [roleState, load]);

  const act = useCallback(async (clerkUserId: string, action: Action) => {
    setBusyId(clerkUserId);
    setError(null);
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clerkUserId, action }),
      });
      const payload = (await response.json()) as PatchResponse;
      if (!payload.ok) {
        setError(payload.error);
        return;
      }
      // In-place update from the authoritative response.
      setUsers((current) =>
        current?.map((user) => (user.clerkUserId === payload.user.clerkUserId ? payload.user : user)) ?? null,
      );
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusyId(null);
    }
  }, []);

  if (roleState === "checking") {
    return <AdminSkeleton />;
  }

  if (roleState === "member") {
    return (
      <section className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 rounded-2xl border border-rose-500/20 bg-rose-500/[0.06] px-8 py-14 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/15 text-2xl">
          🚫
        </span>
        <h2 className="text-xl font-semibold text-rose-100">Admin access required</h2>
        <p className="max-w-sm text-sm leading-6 text-zinc-400">
          This area is for administrators only. Your account doesn&apos;t have the admin role in
          the database.
        </p>
      </section>
    );
  }

  const pending = users?.filter((user) => !user.approved) ?? [];
  const approved = users?.filter((user) => user.approved) ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-50">Admin</h1>
          <p className="mt-1 text-sm text-zinc-500">
            API usage and user access at a glance. Every user starts pending until you approve them.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-400">
            {users ? `${users.length} users` : "…"}
          </span>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-white/20 hover:text-zinc-200"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {error}
        </p>
      )}

      {usage && <GlobalUsageCard usage={usage} />}
      {limits && <LimitsEditor limits={limits} onSaved={setLimits} />}
      {imageModel && <ModelEditor model={imageModel} onSaved={setImageModel} />}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <UserGroup
          title="Pending access"
          hint="These users see the “ask an admin for access” banner."
          empty="No pending users — everyone can generate."
          users={pending}
          busyId={busyId}
          act={act}
        />
        <UserGroup
          title="Approved"
          hint="These users can upload photos and generate."
          empty="No approved users yet."
          users={approved}
          busyId={busyId}
          act={act}
        />
      </div>
    </div>
  );
}

/**
 * Editable per-user spend limits, persisted in the settings table.
 * Changes apply to every user on their next generation attempt.
 */
function LimitsEditor({ limits, onSaved }: { limits: LimitSet; onSaved: (limits: LimitSet) => void }) {
  const [daily, setDaily] = useState(String(limits.daily));
  const [weekly, setWeekly] = useState(String(limits.weekly));
  const [total, setTotal] = useState(String(limits.total));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Re-sync the fields whenever fresh values arrive (load, refresh, save).
  useEffect(() => {
    setDaily(String(limits.daily));
    setWeekly(String(limits.weekly));
    setTotal(String(limits.total));
  }, [limits]);

  const dirty =
    Number(daily) !== limits.daily || Number(weekly) !== limits.weekly || Number(total) !== limits.total;

  const save = async () => {
    const body = { daily: Number(daily), weekly: Number(weekly), total: Number(total) };
    if (![body.daily, body.weekly, body.total].every((v) => Number.isFinite(v) && v >= 0)) {
      setError("Please enter non-negative numbers.");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as
        | { ok: true; limits: LimitSet }
        | { ok: false; error: string; code: string };
      if (!payload.ok) {
        setError(payload.error);
        return;
      }
      onSaved(payload.limits);
      setSaved(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/15 text-[11px] font-bold text-indigo-300">
          ⚙
        </span>
        <div>
          <h2 className="text-sm font-semibold text-zinc-200">Spend limits · per user</h2>
          <p className="mt-0.5 text-xs text-zinc-600">
            Stored in the settings table and applied to every user immediately.
          </p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <LimitField label="Daily" value={daily} onChange={setDaily} hint="resets midnight UTC" onEdit={() => setSaved(false)} />
        <LimitField label="Weekly" value={weekly} onChange={setWeekly} hint="resets Monday UTC" onEdit={() => setSaved(false)} />
        <LimitField label="Lifetime" value={total} onChange={setTotal} hint="never resets" onEdit={() => setSaved(false)} />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={saving || (!dirty && saved)}
          onClick={() => void save()}
          className="h-10 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-5 text-sm font-semibold text-white transition hover:from-indigo-400 hover:to-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save limits"}
        </button>
        {saved && !dirty && <span className="text-xs font-medium text-emerald-400">Saved ✓</span>}
        {error && <span className="text-xs text-rose-300">{error}</span>}
      </div>
    </section>
  );
}

function LimitField({
  label,
  value,
  onChange,
  hint,
  onEdit,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint: string;
  onEdit: () => void;
}) {
  return (
    <label className="block rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <span className="text-xs font-medium text-zinc-400">{label} limit</span>
      <div className="mt-1.5 flex items-center gap-1">
        <span className="text-lg font-semibold text-zinc-500">$</span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          max="1000"
          step="0.01"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            onEdit();
          }}
          className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-indigo-400/50"
        />
      </div>
      <p className="mt-1 text-[11px] text-zinc-600">{hint}</p>
    </label>
  );
}

/**
 * Editable OpenRouter image model, persisted in the settings table.
 * Applies to every generation from the next request onward.
 */
function ModelEditor({ model, onSaved }: { model: string; onSaved: (model: string) => void }) {
  const [value, setValue] = useState(model);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Re-sync whenever fresh values arrive (load, refresh, save).
  useEffect(() => {
    setValue(model);
  }, [model]);

  const dirty = value.trim() !== model;

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageModel: value }),
      });
      const payload = (await response.json()) as
        | { ok: true; imageModel: string }
        | { ok: false; error: string; code: string };
      if (!payload.ok) {
        setError(payload.error);
        return;
      }
      onSaved(payload.imageModel);
      setSaved(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/15 text-[11px] font-bold text-indigo-300">
          🧠
        </span>
        <div>
          <h2 className="text-sm font-semibold text-zinc-200">Image model</h2>
          <p className="mt-0.5 text-xs text-zinc-600">
            OpenRouter model used for every generation. Applies from the next request —
            format <span className="font-mono">vendor/model</span>.
          </p>
        </div>
      </div>
      <div className="max-w-md">
        <label className="block rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <span className="text-xs font-medium text-zinc-400">Model id</span>
          <input
            type="text"
            spellCheck={false}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setSaved(false);
            }}
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-sm text-zinc-100 outline-none transition focus:border-indigo-400/50"
          />
          <p className="mt-1 text-[11px] text-zinc-600">
            Default: <span className="font-mono">google/gemini-3.1-flash-image</span>
          </p>
        </label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={saving || (!dirty && saved)}
          onClick={() => void save()}
          className="h-10 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-5 text-sm font-semibold text-white transition hover:from-indigo-400 hover:to-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save model"}
        </button>
        {saved && !dirty && <span className="text-xs font-medium text-emerald-400">Saved ✓</span>}
        {error && <span className="text-xs text-rose-300">{error}</span>}
      </div>
    </section>
  );
}

/** All-user API usage for the same UTC windows the spend limits use. */
function GlobalUsageCard({ usage }: { usage: GlobalUsage }) {  const rows: Array<{ label: string; win: { used: number; count: number }; note: string }> = [
    { label: "Today", win: usage.daily, note: "resets midnight UTC" },
    { label: "This week", win: usage.weekly, note: "resets Monday UTC" },
    { label: "All time", win: usage.total, note: "since launch" },
  ];

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/15 text-[11px] font-bold text-indigo-300">
          $
        </span>
        <h2 className="text-sm font-semibold text-zinc-200">API usage · all users</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <p className="text-xs font-medium text-zinc-400">{row.label}</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-zinc-50">{formatUsd(row.win.used)}</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {row.win.count} {row.win.count === 1 ? "generation" : "generations"}
            </p>
            <p className="mt-1 text-[11px] text-zinc-600">{row.note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function UserGroup({
  title,
  hint,
  empty,
  users,
  busyId,
  act,
}: {
  title: string;
  hint: string;
  empty: string;
  users: AdminUser[];
  busyId: string | null;
  act: (clerkUserId: string, action: Action) => Promise<void>;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
      <p className="mt-0.5 text-xs text-zinc-600">{hint}</p>
      {users.length === 0 ? (
        <p className="mt-3 text-xs text-zinc-600">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-white/5 rounded-xl border border-white/5">
          {users.map((user) => (
            <li key={user.clerkUserId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm text-zinc-200">
                  {user.email}
                  {user.role === "admin" && (
                    <span className="ml-2 rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-indigo-300 uppercase">
                      admin
                    </span>
                  )}
                </p>
                {user.fullName && <p className="truncate text-xs text-zinc-500">{user.fullName}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {user.approved ? (
                  <ActionButton label="Revoke" onClick={() => void act(user.clerkUserId, "revoke")} busy={busyId === user.clerkUserId} />
                ) : (
                  <ActionButton label="Approve" primary onClick={() => void act(user.clerkUserId, "approve")} busy={busyId === user.clerkUserId} />
                )}
                {user.role === "admin" ? (
                  <ActionButton label="Remove admin" onClick={() => void act(user.clerkUserId, "removeAdmin")} busy={busyId === user.clerkUserId} />
                ) : (
                  <ActionButton label="Make admin" onClick={() => void act(user.clerkUserId, "makeAdmin")} busy={busyId === user.clerkUserId} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ActionButton({
  label,
  onClick,
  busy,
  primary,
}: {
  label: string;
  onClick: () => void;
  busy: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={
        primary
          ? "rounded-lg bg-indigo-500/90 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-40"
          : "rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-white/20 hover:text-zinc-200 disabled:opacity-40"
      }
    >
      {busy ? "…" : label}
    </button>
  );
}

function AdminSkeleton() {
  return (
    <div className="mx-auto w-full max-w-4xl" aria-hidden>
      <div className="shimmer h-10 w-56 rounded-xl border border-white/10 bg-white/[0.02]" />
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="shimmer h-72 rounded-2xl border border-white/10 bg-white/[0.02]" />
        <div className="shimmer h-72 rounded-2xl border border-white/10 bg-white/[0.02]" />
      </div>
    </div>
  );
}
