import { ImageStudio } from "@/components/ImageStudio";

export default function Home() {
  return (
    <div className="page-glow relative flex min-h-screen flex-col">
      <header className="relative z-10 mx-auto w-full max-w-6xl px-6 pt-12 pb-8 sm:pt-16">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-black text-white">
            P
          </span>
          <span className="text-sm font-semibold tracking-wide text-zinc-300">Portrait Studio</span>
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
        <ImageStudio />
      </main>

      <footer className="relative z-10 border-t border-white/5 py-6 text-center text-xs text-zinc-600">
        Powered by Gemini image generation via OpenRouter · Photos are processed per request and
        never stored.
      </footer>
    </div>
  );
}
