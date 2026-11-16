"use client";

import { useCallback, useEffect, useState } from "react";

type AdminStyle = {
  id: string;
  name: string;
  tagline: string;
  emoji: string;
  gradient: string;
  scenePrompt: string;
  enabled: boolean;
  sortOrder: number;
};

type ListResponse = { ok: true; styles: AdminStyle[] } | { ok: false; error: string; code: string };
type MutationResponse = { ok: true; style?: AdminStyle; id?: string } | { ok: false; error: string; code: string };

/**
 * Admin styles manager: edit prompts, enable/disable, add, and delete styles.
 * The database stores the scene prompt; the identity-preservation block is
 * composed by the server, so it can never be edited away by accident.
 */
export function AdminStyles() {
  const [styles, setStyles] = useState<AdminStyle[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/admin/styles");
      const payload = (await response.json()) as ListResponse;
      if (!payload.ok) {
        setError(payload.error);
        return;
      }
      setStyles(payload.styles);
    } catch {
      setError("Could not load styles. Is the database configured?");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const replaceStyle = useCallback((style: AdminStyle) => {
    setStyles((current) => current?.map((item) => (item.id === style.id ? style : item)) ?? null);
  }, []);

  const removeStyle = useCallback((id: string) => {
    setStyles((current) => current?.filter((item) => item.id !== id) ?? null);
  }, []);

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-200">Styles</h2>
          <p className="mt-0.5 text-xs text-zinc-600">
            The scene prompt is stored in the database; the identity-preservation block is added
            automatically when generating, so every style keeps the same identity contract.
          </p>
        </div>
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

      {styles === null && !error ? (
        <p className="mt-3 text-xs text-zinc-600">Loading styles…</p>
      ) : (
        <div className="mt-4 grid gap-4">
          {styles?.map((style) => (
            <StyleCard key={style.id} style={style} onReplaced={replaceStyle} onDeleted={() => removeStyle(style.id)} />
          ))}
        </div>
      )}

      <AddStyleForm onCreated={(style) => setStyles((current) => [...(current ?? []), style])} />
    </section>
  );
}

function StyleCard({
  style,
  onReplaced,
  onDeleted,
}: {
  style: AdminStyle;
  onReplaced: (style: AdminStyle) => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(style.name);
  const [tagline, setTagline] = useState(style.tagline);
  const [emoji, setEmoji] = useState(style.emoji);
  const [scenePrompt, setScenePrompt] = useState(style.scenePrompt);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    name !== style.name || tagline !== style.tagline || emoji !== style.emoji || scenePrompt !== style.scenePrompt;

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch(`/api/admin/styles/${encodeURIComponent(style.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, tagline, emoji, scenePrompt }),
      });
      const payload = (await response.json()) as MutationResponse;
      if (!payload.ok || !payload.style) {
        setError(payload.ok ? "Unexpected response." : payload.error);
        return;
      }
      onReplaced(payload.style);
      setSaved(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/styles/${encodeURIComponent(style.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !style.enabled }),
      });
      const payload = (await response.json()) as MutationResponse;
      if (!payload.ok || !payload.style) {
        setError(payload.ok ? "Unexpected response." : payload.error);
        return;
      }
      onReplaced(payload.style);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete style "${style.name}" (${style.id})? This cannot be undone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/styles/${encodeURIComponent(style.id)}`, { method: "DELETE" });
      const payload = (await response.json()) as MutationResponse;
      if (!payload.ok) {
        setError(payload.error);
        return;
      }
      onDeleted();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br text-lg ${style.gradient}`}>
          {style.emoji}
        </span>
        <span className="font-mono text-xs text-zinc-500">{style.id}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${
            style.enabled
              ? "bg-emerald-500/15 text-emerald-300"
              : "bg-zinc-500/15 text-zinc-400"
          }`}
        >
          {style.enabled ? "enabled" : "disabled"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            disabled={saving || deleting}
            onClick={() => void toggle()}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-white/20 hover:text-zinc-200 disabled:opacity-40"
          >
            {style.enabled ? "Disable" : "Enable"}
          </button>
          <button
            type="button"
            disabled={saving || deleting}
            onClick={() => void remove()}
            className="rounded-lg border border-rose-500/20 px-3 py-1.5 text-xs text-rose-300 transition hover:border-rose-400/40 hover:text-rose-200 disabled:opacity-40"
          >
            {deleting ? "…" : "Delete"}
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr]">
        <label className="block">
          <span className="text-xs font-medium text-zinc-400">Name</span>
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setSaved(false);
            }}
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-indigo-400/50"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-zinc-400">Tagline</span>
          <input
            value={tagline}
            onChange={(event) => {
              setTagline(event.target.value);
              setSaved(false);
            }}
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-indigo-400/50"
          />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="text-xs font-medium text-zinc-400">Scene prompt (identity block is appended automatically)</span>
        <textarea
          value={scenePrompt}
          onChange={(event) => {
            setScenePrompt(event.target.value);
            setSaved(false);
          }}
          rows={4}
          className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-xs leading-5 text-zinc-100 outline-none transition focus:border-indigo-400/50"
        />
      </label>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={saving || deleting || !dirty}
          onClick={() => void save()}
          className="h-9 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 text-xs font-semibold text-white transition hover:from-indigo-400 hover:to-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {saved && !dirty && <span className="text-xs font-medium text-emerald-400">Saved ✓</span>}
        {error && <span className="text-xs text-rose-300">{error}</span>}
      </div>
    </div>
  );
}

function AddStyleForm({ onCreated }: { onCreated: (style: AdminStyle) => void }) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [emoji, setEmoji] = useState("🎨");
  const [scenePrompt, setScenePrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/styles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: id.trim(), name: name.trim(), tagline: tagline.trim(), emoji: emoji.trim(), scenePrompt }),
      });
      const payload = (await response.json()) as MutationResponse;
      if (!payload.ok || !payload.style) {
        setError(payload.ok ? "Unexpected response." : payload.error);
        return;
      }
      onCreated(payload.style);
      setOpen(false);
      setId("");
      setName("");
      setTagline("");
      setEmoji("🎨");
      setScenePrompt("");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setCreating(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 h-10 w-full rounded-xl border border-dashed border-white/15 text-sm text-zinc-400 transition hover:border-indigo-400/40 hover:text-indigo-200"
      >
        + Add a new style
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-indigo-400/20 bg-indigo-500/[0.04] p-4">
      <h3 className="text-sm font-semibold text-zinc-200">New style</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs font-medium text-zinc-400">Id (lowercase, hyphens)</span>
          <input
            value={id}
            onChange={(event) => setId(event.target.value)}
            placeholder="gym"
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-sm text-zinc-100 outline-none transition focus:border-indigo-400/50"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-zinc-400">Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Gym"
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-indigo-400/50"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-zinc-400">Emoji</span>
          <input
            value={emoji}
            onChange={(event) => setEmoji(event.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-indigo-400/50"
          />
        </label>
      </div>
      <label className="mt-3 block">
        <span className="text-xs font-medium text-zinc-400">Tagline</span>
        <input
          value={tagline}
          onChange={(event) => setTagline(event.target.value)}
          placeholder="Mid-workout, weights in hand"
          className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-indigo-400/50"
        />
      </label>
      <label className="mt-3 block">
        <span className="text-xs font-medium text-zinc-400">Scene prompt (identity block is appended automatically)</span>
        <textarea
          value={scenePrompt}
          onChange={(event) => setScenePrompt(event.target.value)}
          rows={4}
          placeholder="Place the person from the photo in a modern gym…"
          className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-xs leading-5 text-zinc-100 outline-none transition focus:border-indigo-400/50"
        />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={creating}
          onClick={() => void create()}
          className="h-10 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-5 text-sm font-semibold text-white transition hover:from-indigo-400 hover:to-violet-400 disabled:opacity-40"
        >
          {creating ? "Creating…" : "Create style"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="h-10 rounded-xl border border-white/10 px-4 text-sm text-zinc-400 transition hover:border-white/20 hover:text-zinc-200"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-rose-300">{error}</span>}
      </div>
    </div>
  );
}
