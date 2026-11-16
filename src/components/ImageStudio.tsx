"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ImageUploader } from "./ImageUploader";
import { StylePicker } from "./StylePicker";
import { ResultPanel } from "./ResultPanel";
import { UsageMeter } from "./UsageMeter";
import { DEFAULT_STYLE_ID, type StyleDefinition } from "@/lib/styles";
import { DEFAULT_SPEND_LIMITS, type GenerateResponse, type LimitSet, type UsageSnapshot } from "@/lib/api";

type Status = "idle" | "generating" | "done" | "error";
type MeResponse =
  | { ok: true; access: boolean; role: "admin" | "member"; email: string; fullName: string | null; usage?: UsageSnapshot; limits?: LimitSet }
  | { ok: false; error: string; code: string };

export function ImageStudio() {
  const [photo, setPhoto] = useState<string | null>(null);
  const [styleId, setStyleId] = useState<string>(DEFAULT_STYLE_ID);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<Extract<MeResponse, { ok: true }> | null>(null);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [limits, setLimits] = useState<LimitSet>(DEFAULT_SPEND_LIMITS);
  const [styles, setStyles] = useState<StyleDefinition[]>([]);
  const [accessState, setAccessState] = useState<"checking" | "denied" | "granted">("checking");

  // Ask the server whether this account may generate. First-time users are
  // auto-provisioned as pending and must ask an admin for access. Also
  // returns spend usage and the current (admin-editable) limits.
  const checkAccess = useCallback(async () => {
    try {
      const response = await fetch("/api/me");
      const payload = (await response.json()) as MeResponse;
      if (!payload.ok) {
        setAccessState("denied");
        return;
      }
      setMe(payload);
      setUsage(payload.usage ?? null);
      setLimits(payload.limits ?? DEFAULT_SPEND_LIMITS);
      setAccessState(payload.access ? "granted" : "denied");
    } catch {
      setAccessState("denied");
    }
  }, []);

  useEffect(() => {
    void checkAccess();
  }, [checkAccess]);

  // Styles are database-driven and admin-managed; the public endpoint serves
  // the enabled ones. If the current selection disappears, fall back to the
  // first available style.
  const loadStyles = useCallback(async () => {
    try {
      const response = await fetch("/api/styles");
      const payload = (await response.json()) as { ok: boolean; styles?: StyleDefinition[] };
      if (!payload.ok || !payload.styles) return;
      setStyles(payload.styles);
      setStyleId((current) =>
        payload.styles!.some((style) => style.id === current) ? current : payload.styles![0]?.id ?? DEFAULT_STYLE_ID,
      );
    } catch {
      // Picker shows a "no styles available" notice; server still validates.
    }
  }, []);

  useEffect(() => {
    void loadStyles();
  }, [loadStyles]);

  // Abort any in-flight generation when a new one starts or the page unmounts.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const generate = useCallback(async () => {
    if (!photo) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("generating");
    setResult(null);
    setError(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: photo, styleId } satisfies { image: string; styleId: string }),
        signal: controller.signal,
      });

      const payload = (await response.json()) as GenerateResponse;

      if (!payload.ok || !response.ok) {
        setStatus("error");
        setError(payload.ok === false ? payload.error : `Request failed (${response.status}).`);
        // Access may have been revoked mid-session — flip back to the banner.
        if (payload.ok === false && payload.code === "access_pending") {
          setAccessState("denied");
        }
        // Keep the meter accurate after a limit is hit (limits may have changed).
        if (payload.ok === false) {
          if (payload.usage) setUsage(payload.usage);
          if (payload.limits) setLimits(payload.limits);
        }
        return;
      }

      setResult(payload.image);
      setStatus("done");
      if (payload.usage) {
        setUsage(payload.usage);
      }
      if (payload.limits) {
        setLimits(payload.limits);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setStatus("error");
      setError("Network error — please check your connection and try again.");
    }
  }, [photo, styleId]);

  if (accessState === "checking") {
    return (
      <div className="grid w-full gap-6 lg:grid-cols-2" aria-hidden>
        <div className="shimmer h-96 rounded-2xl border border-white/10 bg-white/[0.02]" />
        <div className="shimmer h-96 rounded-2xl border border-white/10 bg-white/[0.02]" />
      </div>
    );
  }

  if (accessState === "denied") {
    return <AccessPending email={me?.email ?? null} onRecheck={() => void checkAccess()} />;
  }

  const busy = status === "generating";
  const style = styles.find((item) => item.id === styleId);

  return (
    <div className="grid w-full gap-6 lg:grid-cols-2">
      {/* Left: controls */}
      <div className="flex flex-col gap-6">
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <SectionTitle step={1} title="Upload your photo" />
          <ImageUploader photo={photo} onPhotoChange={setPhoto} disabled={busy} />
          <p className="mt-3 text-xs text-zinc-500">
            A clear, front-facing photo of one person works best. Images are processed in your
            browser before upload.
          </p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <SectionTitle step={2} title="Choose a style" />
          <StylePicker styles={styles} value={styleId} onChange={setStyleId} disabled={busy} />
        </section>

        <button
          type="button"
          disabled={!photo || busy}
          onClick={() => void generate()}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-500 text-base font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:from-indigo-400 hover:to-violet-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:from-indigo-500 disabled:hover:to-violet-500"
        >
          {busy ? (
            <>
              <Spinner /> Generating…
            </>
          ) : (
            <>Generate {style ? `“${style.name}”` : ""} scene</>
          )}
        </button>

        <UsageMeter usage={usage} limits={limits} />
      </div>

      {/* Right: result */}
      <ResultPanel
        status={status}
        result={result}
        error={error}
        styleName={style?.name ?? "styled"}
      />
    </div>
  );
}

function SectionTitle({ step, title }: { step: number; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/15 text-[11px] font-bold text-indigo-300">
        {step}
      </span>
      <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V2a10 10 0 1 0 10 10h-2a8 8 0 0 1-8 8v2a10 10 0 0 0 10-10z"
      />
    </svg>
  );
}

/** Shown while the account exists but has not been approved by an admin yet. */
function AccessPending({ email, onRecheck }: { email: string | null; onRecheck: () => void }) {
  return (
    <section className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-8 py-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-2xl">
        ⏳
      </span>
      <h2 className="text-xl font-semibold text-amber-100">You need admin access</h2>
      <p className="max-w-sm text-sm leading-6 text-zinc-400">
        {email ? (
          <>
            Your account (<span className="text-zinc-300">{email}</span>) hasn&apos;t been approved
            yet.
          </>
        ) : (
          "Your account hasn't been approved yet."
        )}{" "}
        Please ask an admin to grant you access before you can upload photos and generate images.
      </p>
      <button
        type="button"
        onClick={onRecheck}
        className="mt-2 h-11 rounded-xl border border-white/10 px-5 text-sm font-semibold text-zinc-300 transition hover:border-white/20 hover:text-white"
      >
        I have access now — recheck
      </button>
    </section>
  );
}
