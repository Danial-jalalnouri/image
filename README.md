# Portrait Studio

Upload a photo of yourself, pick a scene (e.g. **Office**), and AI places you into it — same
face, brand-new setting.

Built with Next.js (App Router, TypeScript, Tailwind v4). Image generation runs on
`google/gemini-3.1-flash-image` (Nano Banana 2) through [OpenRouter](https://openrouter.ai).
Authentication is handled by [Clerk](https://clerk.com) — **email + password only**
(no social login), managed via the `clerk` CLI against the `image` application.

## Quick start

```bash
npm install
cp .env.example .env.local   # add your OPENROUTER_API_KEY
npm run dev                  # http://localhost:3000
```

Clerk development keys live in `.env.local` too (never committed). If they are missing, run
`npx clerk@latest env pull` while linked to the `image` application
(`app_3M9z7hwFSUaXabY1fmtsNvCizYL`).

## Authentication

- **Provider**: Clerk, application `image` (dev instance). Configure providers with
  `npx clerk@latest config pull` / `config patch` — Google OAuth is disabled; sign-in is
  email + password only.
- **Gated UI**: `src/app/page.tsx` renders the studio behind `<Show when="signed-in">`
  (Clerk Core 3 pattern); signed-out visitors see a sign-in prompt. Header shows
  `<SignInButton mode="modal">` / `<SignUpButton mode="modal">` when signed out and
  `<UserButton />` when signed in.
- **Protected API**: `POST /api/generate` calls `await auth()` and returns `401 unauthorized`
  without a signed-in user — generation costs real credits. `GET /api/styles` stays public.
- **Middleware**: `src/proxy.ts` (Next.js 16 name for middleware) runs `clerkMiddleware()`.

## How it works

```
Browser                          Server (Next.js route)              OpenRouter
───────                          ──────────────────────              ──────────
1. pick/drag/paste photo
2. validate + downscale
   (canvas, JPEG/PNG)
3. POST /api/generate ────────▶ 4. rate-limit + zod validation ───▶ 5. chat/completions
      { image, styleId }             (key stays server-side)          model + prompt
                                                                       + user image,
                                                                       modalities: image
6. show result ◀───────────────  8. JSON { image: dataUrl } ◀────── 7. message.images[]
   download / copy / retry
```

- **API key never reaches the client.** All OpenRouter traffic goes through `POST /api/generate`.
- **Client-side preprocessing** keeps uploads small and fast; server limits are the safety net.
- **Styles are data, not code** — add a new scene by appending one entry to
  `src/lib/styles.ts`. Every style prompt shares the same identity-preservation contract:
  keep the person's face identical, re-light and re-dress them for the scene.

## Project layout

```
src/
  app/
    api/generate/route.ts   # POST endpoint: validation, rate limit, OpenRouter call
    layout.tsx / page.tsx   # shell + marketing header
    globals.css             # Tailwind v4 theme, dark studio look
  components/
    ImageStudio.tsx         # orchestrates state + fetch
    ImageUploader.tsx       # drag & drop, click, clipboard paste
    StylePicker.tsx         # style cards (data-driven)
    ResultPanel.tsx         # result, download, error states
  lib/
    styles.ts               # style registry (prompts live here)
    api.ts                  # shared client/server API contract
    openrouter.ts           # server-only OpenRouter client
    image-client.ts         # browser-side validation/downscale
    rate-limit.ts           # per-IP fixed-window limiter (in-memory)
    constants.ts
```

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | yes | OpenRouter API key |
| `OPENROUTER_IMAGE_MODEL` | no | Override model (default `google/gemini-3.1-flash-image`) |
| `OPENROUTER_BASE_URL` | no | OpenRouter-compatible endpoint override |
| `APP_URL` | no | Sent to OpenRouter as `HTTP-Referer` for attribution |
| `CLERK_SECRET_KEY` / `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | yes | Clerk keys (written by `clerk init` / `clerk env pull`) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` etc. | no | Clerk route overrides (written by `clerk init`) |

## Production notes

- **Deploy**: `npm run build && npm start`, or deploy to Vercel/any Node host. Set env vars in
  your platform's dashboard — never commit `.env.local`.
- **Rate limiting** is a per-instance in-memory limiter (8 requests/min per IP). For horizontal
  scaling, swap `src/lib/rate-limit.ts` internals for Redis or an edge limiter — the call-site
  contract (`checkRateLimit`, `clientKey`) stays unchanged.
- **Privacy**: photos are processed per request and never persisted by the app; OpenRouter's own
  data policy applies upstream.
- **Errors** are mapped to stable codes (`bad_request`, `too_large`, `rate_limited`,
  `not_configured`, `upstream_error`, `upstream_refused`, `timeout`) shared between server and
  client via `src/lib/api.ts`.
