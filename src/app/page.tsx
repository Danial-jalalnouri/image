import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { Suspense } from "react";

import { ImageStudio } from "@/components/ImageStudio";

export default function Home() {
  return (
    <div className="page-glow relative flex min-h-screen flex-col">
      <header className="relative z-10 mx-auto w-full max-w-6xl px-6 pt-12 pb-8 sm:pt-16">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-black text-white">
              P
            </span>
            <span className="text-sm font-semibold tracking-wide text-zinc-300">Portrait Studio</span>
          </div>
          <Suspense fallback={null}>
            <div className="flex items-center gap-3">
              <Show
                when="signed-out"
                fallback={<UserButton />}
              >
                <SignInButton mode="modal" />
                <SignUpButton mode="modal">
                  <button className="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:from-indigo-400 hover:to-violet-400">
                    Sign up free
                  </button>
                </SignUpButton>
              </Show>
            </div>
          </Suspense>
        </div>
        <h1 className="mt-6 max-w-2xl text-4xl font-bold leading-tight tracking-tight text-zinc-50 sm:text-5xl">
          Put yourself{" "}
          <span className="bg-gradient-to-r from-indigo-300 to-fuchsia-300 bg-clip-text text-transparent">
            anywhere
          </span>
          , with one photo.
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-zinc-400">
          Upload a picture of yourself, choose a scene, and AI will place you there — same face,
          brand-new setting.
        </p>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-6 pb-16">
        <Suspense fallback={<StudioSkeleton />}>
          <Show when="signed-in" fallback={<SignInPrompt />}>
            <ImageStudio />
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

function SignInPrompt() {
  return (
    <section className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] px-8 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/15 text-2xl">
        🔐
      </span>
      <h2 className="text-xl font-semibold text-zinc-100">Sign in to start creating</h2>
      <p className="max-w-sm text-sm leading-6 text-zinc-400">
        Create a free account to upload your photo and place yourself in any scene. Your images are
        tied to your account.
      </p>
      <SignInButton mode="modal">
        <button className="mt-2 h-12 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-6 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:from-indigo-400 hover:to-violet-400">
          Sign in to continue
        </button>
      </SignInButton>
    </section>
  );
}

function StudioSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-2" aria-hidden>
      <div className="shimmer h-96 rounded-2xl border border-white/10 bg-white/[0.02]" />
      <div className="shimmer h-96 rounded-2xl border border-white/10 bg-white/[0.02]" />
    </div>
  );
}
