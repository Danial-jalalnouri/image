"use client";

import { downloadDataUrl } from "@/lib/image-client";

interface ResultPanelProps {
  status: "idle" | "generating" | "done" | "error";
  /** Generated image as a data URL (when status === "done"). */
  result: string | null;
  /** User-facing error message (when status === "error"). */
  error: string | null;
  /** Name of the applied style, for the caption and filename. */
  styleName: string;
}

export function ResultPanel({ status, result, error, styleName }: ResultPanelProps) {
  return (
    <div className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/60">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-200">Result</h2>
        {status === "done" ? (
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
            {styleName}
          </span>
        ) : null}
      </div>

      <div className="relative flex flex-1 items-center justify-center p-4">
        {status === "idle" ? (
          <Placeholder />
        ) : status === "generating" ? (
          <Generating />
        ) : status === "error" ? (
          <ErrorState message={error} />
        ) : result ? (
          <ResultImage result={result} styleName={styleName} />
        ) : (
          <Placeholder />
        )}
      </div>
    </div>
  );
}

function Placeholder() {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04] text-2xl">
        ✨
      </span>
      <p className="max-w-60 text-sm text-zinc-400">
        Upload a photo, pick a style, and your new scene will appear here.
      </p>
    </div>
  );
}

function Generating() {
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="shimmer relative flex h-56 w-full max-w-sm items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
        <span className="animate-pulse text-3xl">🎬</span>
      </div>
      <p className="text-sm text-zinc-400">Placing you into the scene… this usually takes a few seconds.</p>
    </div>
  );
}

function ErrorState({ message }: { message: string | null }) {
  return (
    <div className="flex max-w-sm flex-col items-center gap-3 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/10 text-2xl">
        ⚠️
      </span>
      <p className="text-sm text-zinc-300">{message ?? "Something went wrong."}</p>
      <p className="text-xs text-zinc-500">You can try again with a different photo or style.</p>
    </div>
  );
}

function ResultImage({ result, styleName }: { result: string; styleName: string }) {
  const filename = `styled-${styleName.toLowerCase()}.png`;
  return (
    <div className="flex w-full flex-col items-center gap-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- model output data URL, not a remote asset */}
      <img
        src={result}
        alt={`Photo restyled as ${styleName}`}
        className="max-h-96 w-auto max-w-full rounded-xl border border-white/10 object-contain shadow-2xl"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => downloadDataUrl(result, filename)}
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400"
        >
          Download
        </button>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(result).catch(() => {})}
          className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5"
        >
          Copy
        </button>
      </div>
    </div>
  );
}
