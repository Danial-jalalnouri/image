"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { InvalidImageError, prepareImageFile } from "@/lib/image-client";

interface ImageUploaderProps {
  /** Current photo as a data URL, or null. */
  photo: string | null;
  onPhotoChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}

export function ImageUploader({ photo, onPhotoChange, disabled = false }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      setError(null);
      try {
        const dataUrl = await prepareImageFile(file);
        onPhotoChange(dataUrl);
      } catch (err) {
        setError(err instanceof InvalidImageError ? err.message : "Could not read that image.");
      }
    },
    [onPhotoChange],
  );

  // Support pasting screenshots or copied images directly.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (disabled) return;
      const file = Array.from(event.clipboardData?.items ?? [])
        .find((item) => item.kind === "file")
        ?.getAsFile();
      if (file) {
        const list = new DataTransfer();
        list.items.add(file);
        void handleFiles(list.files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [disabled, handleFiles]);

  if (photo) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950">
        {/* eslint-disable-next-line @next/next/no-img-element -- local data URL, not a remote asset */}
        <img src={photo} alt="Your uploaded photo" className="max-h-96 w-full object-contain" />
        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-2.5">
          <span className="text-xs text-zinc-400">Ready for styling</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/5 disabled:opacity-40"
            >
              Replace
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                onPhotoChange(null);
                setError(null);
              }}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/5 disabled:opacity-40"
            >
              Remove
            </button>
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            void handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) void handleFiles(event.dataTransfer.files);
        }}
        className={`flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition ${
          dragging
            ? "border-indigo-400 bg-indigo-500/10"
            : "border-white/15 bg-white/[0.02] hover:border-white/30 hover:bg-white/[0.04]"
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/15 text-2xl">
          🖼️
        </span>
        <span className="text-sm font-medium text-zinc-200">
          Drop a photo here, or click to choose
        </span>
        <span className="text-xs text-zinc-500">
          PNG, JPEG, or WebP · you can also paste from the clipboard
        </span>
      </button>
      {error ? <p className="mt-2 text-xs text-rose-400">{error}</p> : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          void handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
