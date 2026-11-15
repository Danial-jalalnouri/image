"use client";

import { STYLES } from "@/lib/styles";

interface StylePickerProps {
  value: string;
  onChange: (styleId: string) => void;
  disabled?: boolean;
}

export function StylePicker({ value, onChange, disabled = false }: StylePickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Scene style"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3"
    >
      {STYLES.map((style) => {
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
