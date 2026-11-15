"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ImageUploader } from "./ImageUploader";
import { StylePicker } from "./StylePicker";
import { ResultPanel } from "./ResultPanel";
import { DEFAULT_STYLE_ID, getStyle } from "@/lib/styles";
import type { GenerateResponse } from "@/lib/api";

type Status = "idle" | "generating" | "done" | "error";

export function ImageStudio() {
  const [photo, setPhoto] = useState<string | null>(null);
  const [styleId, setStyleId] = useState<string>(DEFAULT_STYLE_ID);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        return;
      }

      setResult(payload.image);
      setStatus("done");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setStatus("error");
      setError("Network error — please check your connection and try again.");
    }
  }, [photo, styleId]);

  const busy = status === "generating";
  const style = getStyle(styleId);

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
          <StylePicker value={styleId} onChange={setStyleId} disabled={busy} />
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
