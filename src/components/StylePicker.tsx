"use client";

import type { StyleDefinition } from "@/lib/styles";

interface StylePickerProps {
  /** Enabled styles, live from the database (GET /api/styles). */
  styles: StyleDefinition[];
  value: string;
  onChange: (styleId: string) => void;
  disabled?: boolean;
}

export function StylePicker({ styles, value, onChange, disabled = false }: StylePickerProps) {
  if (styles.length === 0) {
    return (
      <p className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-xs text-amber-200">
        No styles are available right now. An admin can add or re-enable styles in the admin area.
      </p>
    );
  }
  return (
    <div
      role="radiogroup"
      aria-label="Scene style"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3"
    >
      {styles.map((style) => {
        const selected = style.id === value;
        return (
          <button
            key={style.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(style.id)}
            className={`group relative overflow-hidden rounded-xl border p-3 text-left transition ${
              selected
                ? "border-indigo-400/70 bg-indigo-500/10 ring-1 ring-indigo-400/40"
                : "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.05]"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br text-lg ${style.gradient}`}
            >
              {style.emoji}
            </span>
            <span className="mt-2 block text-sm font-semibold text-zinc-100">{style.name}</span>
            <span className="block text-[11px] leading-4 text-zinc-400">{style.tagline}</span>
            {selected ? (
              <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500 text-[10px] text-white">
                ✓
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
