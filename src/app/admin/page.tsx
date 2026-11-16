import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import { Suspense } from "react";

import { AdminStyles } from "@/components/AdminStyles";
import { AdminUsers } from "@/components/AdminUsers";

export const metadata = {
  title: "Admin — Portrait Studio",
};

export default function AdminPage() {
  return (
    <div className="page-glow relative flex min-h-screen flex-col">
      <header className="relative z-10 mx-auto w-full max-w-6xl px-6 pt-12 pb-8 sm:pt-16">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="flex items-center gap-2 transition hover:opacity-80"
              aria-label="Back to the studio"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-black text-white">
                P
              </span>
              <span className="text-sm font-semibold tracking-wide text-zinc-300">Portrait Studio</span>
            </a>
            <span className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-indigo-300 uppercase">
              admin
            </span>
          </div>
          <Suspense fallback={null}>
            <div className="flex items-center gap-3">
              <Show when="signed-out" fallback={<UserButton />}>
                <SignInButton mode="modal" />
              </Show>
            </div>
          </Suspense>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-6 pb-16">
        <Suspense fallback={<AdminSkeleton />}>
          <Show when="signed-in" fallback={<AdminSignInPrompt />}>
            <AdminUsers />
            <AdminStyles />
          </Show>
        </Suspense>
      </main>

      <footer className="relative z-10 border-t border-white/5 py-6">
        <div className="flex flex-col items-center justify-center gap-2 text-xs text-zinc-600 sm:flex-row sm:gap-4">
          <span>
            Powered by Gemini image generation via OpenRouter · Photos are processed per request and
            never stored.
          </span>
          <a
            href="/how-it-works.html"
            className="text-indigo-300/80 underline-offset-4 transition hover:text-indigo-200 hover:underline"
          >
            How it works →
          </a>
        </div>
      </footer>
    </div>
  );
}

function AdminSignInPrompt() {
  return (
    <section className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] px-8 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/15 text-2xl">
        🔐
      </span>
      <h2 className="text-xl font-semibold text-zinc-100">Sign in to manage users</h2>
      <p className="max-w-sm text-sm leading-6 text-zinc-400">
        The admin area is only available to signed-in users with the admin role.
      </p>
      <SignInButton mode="modal">
        <button className="mt-2 h-12 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-6 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:from-indigo-400 hover:to-violet-400">
          Sign in to continue
        </button>
      </SignInButton>
    </section>
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
