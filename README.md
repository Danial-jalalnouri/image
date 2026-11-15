# Portrait Studio

Upload a photo of yourself, pick a scene (e.g. **Office**), and AI places you into it — same
face, brand-new setting.

Built with Next.js (App Router, TypeScript, Tailwind v4). Image generation runs on
`google/gemini-3.1-flash-image` (Nano Banana 2) through [OpenRouter](https://openrouter.ai).
Authentication is handled by [Clerk](https://clerk.com) — **email + password only**
(no social login), managed via the `clerk` CLI against the `image` application.
Users and spend tracking live in [Neon](https://neon.tech) Postgres.

## Quick start

```bash
npm install
cp .env.example .env.local   # add your OPENROUTER_API_KEY + DATABASE_URL
npm run dev                  # http://localhost:3000
```

Clerk development keys live in `.env.local` too (never committed). If they are missing, run
`npx clerk@latest env pull` while linked to the `image` application
(`app_3M9z7hwFSUaXabY1fmtsNvCizYL`).

## Access control (Neon)

New users cannot generate images until an admin approves them.

- **Database**: Neon project `image` (`bitter-voice-15889858`). The `users` table maps
  Clerk users to roles: `clerk_user_id` (PK), `email` (unique), `role`
  (`admin` | `member`, default `member`), `approved` (default `false`). Admins are simply
  rows with `role = 'admin'`.
- **Auto-provisioning**: the first time a signed-in user is seen, `GET /api/me` (and
  `POST /api/generate`) inserts them as a **pending member**. The studio shows an
  "ask an admin for access" banner with a recheck button until they are approved.
- **Admin panel**: users with `role = 'admin'` get an in-app panel (approve / revoke,
  make admin / remove admin) backed by `GET|PATCH /api/admin/users`. Admin rights are
  checked against the database on every admin request. Admins cannot revoke their own
  access or demote themselves.
- **Enforcement**: `POST /api/generate` rejects non-approved users with
  `403 access_pending` — "Please ask an admin to grant you access."

## Spending limits

Every generation's exact cost is captured from OpenRouter (`usage.cost`; a conservative
estimate is recorded if telemetry is unavailable) into the `generations` table, and
enforced **per user** before any upstream call:

| Window | Limit | Reset |
| --- | --- | --- |
| Daily | $1.00 | midnight UTC |
| Weekly | $2.00 | Monday 00:00 UTC |
| Lifetime | $3.00 | never |

- Exhausted budgets return `429 budget_exhausted` with a friendly message and the
  current usage, so the client can update immediately.
- Signed-in users see a **usage meter** (Today / This week / All time) with used,
  remaining, and reset info; it refreshes after every generation via the `usage`
  field on both success and limit-reached responses.
- Limits are defined once in `src/lib/limits.ts` (`SPEND_LIMITS`) and shared by the
  server (enforcement) and the client (display), so they can never drift.

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
3. POST /api/generate ────────▶ 4. auth → access → budget check ──▶ 5. chat/completions
      { image, styleId }             → rate limit + zod              model + prompt
                                     (key stays server-side)         + user image,
                                                                     modalities: image
6. show result ◀───────────────  8. JSON { image, usage } ◀─────── 7. message.images[]
                                    + cost logged to Neon            + usage.cost
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
    api/generate/route.ts   # POST endpoint: auth, access, budget, rate limit, OpenRouter
    api/me/route.ts         # access status + usage for the signed-in user
    api/admin/users/route.ts# admin-only list/approve/revoke/role management
    api/styles/route.ts     # public styles registry (also feeds the docs page)
    layout.tsx / page.tsx   # shell + marketing header
    globals.css             # Tailwind v4 theme, dark studio look
  components/
    ImageStudio.tsx         # orchestrates state + fetch
    ImageUploader.tsx       # drag & drop, click, clipboard paste
    StylePicker.tsx         # style cards (data-driven)
    ResultPanel.tsx         # result, download, error states
    UsageMeter.tsx          # daily/weekly/lifetime spend bars
    AdminUsersPanel.tsx     # admin-only user management
  lib/
    styles.ts               # style registry (prompts live here)
    api.ts                  # shared client/server API contract
    limits.ts               # spend limits + usage types (server & client)
    db.ts                   # Neon Postgres access (users, generations)
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
| `DATABASE_URL` | yes | Neon Postgres connection string (project `image`) |
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
- **Errors** are mapped to stable codes (`unauthorized`, `access_pending`, `budget_exhausted`,
  `bad_request`, `too_large`, `rate_limited`, `not_configured`, `upstream_error`,
  `upstream_refused`, `timeout`) shared between server and client via `src/lib/api.ts`.
