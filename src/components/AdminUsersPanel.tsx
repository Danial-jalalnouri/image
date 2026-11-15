"use client";

import { useCallback, useEffect, useState } from "react";

type AdminUser = {
  clerkUserId: string;
  email: string;
  fullName: string | null;
  role: "admin" | "member";
  approved: boolean;
};

type ListResponse = { ok: true; users: AdminUser[] } | { ok: false; error: string; code: string };
type PatchResponse = { ok: true; user: AdminUser } | { ok: false; error: string; code: string };

type Action = "approve" | "revoke" | "makeAdmin" | "removeAdmin";

/**
 * Admin-only panel: approve/revoke access and manage admin roles.
 * Rendered only when the signed-in user has role = 'admin' in the database.
 */
export function AdminUsersPanel() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/admin/users");
      const payload = (await response.json()) as ListResponse;
      if (!payload.ok) {
        // Non-admins get a 403 — quietly hide the panel content.
        if (payload.code === "forbidden") {
          setUsers([]);
          return;
        }
        setError(payload.error);
        return;
      }
      setUsers(payload.users);
    } catch {
      setError("Could not load users. Is the database configured?");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (clerkUserId: string, action: Action) => {
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
        // Optimistic in-place update from the authoritative response.
        setUsers((current) =>
          current?.map((user) => (user.clerkUserId === payload.user.clerkUserId ? payload.user : user)) ?? null,
        );
      } catch {
        setError("Network error — please try again.");
      } finally {
        setBusyId(null);
      }
    },
    [],
  );

  if (users === null && !error) {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="text-sm font-semibold text-zinc-200">Admin · Users</h2>
        <p className="mt-3 text-sm text-zinc-500">Loading users…</p>
      </section>
    );
  }

  // Non-admins: render nothing at all.
  if (!error && users && users.length === 0) {
    return null;
  }

  const pending = users?.filter((user) => !user.approved) ?? [];
  const approved = users?.filter((user) => user.approved) ?? [];

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-200">Admin · Users</h2>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-white/20 hover:text-zinc-200"
        >
          Refresh
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {error}
        </p>
      )}

      <UserGroup
        title="Pending access"
        empty="No pending users — everyone can generate."
        users={pending}
        busyId={busyId}
        act={act}
      />
      <UserGroup
        title="Approved"
        empty="No approved users yet."
        users={approved}
        busyId={busyId}
        act={act}
      />
    </section>
  );
}

function UserGroup({
  title,
  empty,
  users,
  busyId,
  act,
}: {
  title: string;
  empty: string;
  users: AdminUser[];
  busyId: string | null;
  act: (clerkUserId: string, action: Action) => Promise<void>;
}) {
  return (
    <div className="mt-4">
      <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">{title}</h3>
      {users.length === 0 ? (
        <p className="mt-2 text-xs text-zinc-600">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-white/5 rounded-xl border border-white/5">
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
    </div>
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
