# Portrait Studio

Upload a photo of yourself, pick a scene (e.g. **Office**), and AI places you into it — same
face, brand-new setting.

Built with Next.js (App Router, TypeScript, Tailwind v4). Image generation runs on an
OpenRouter image model — `google/gemini-3.1-flash-image` (Nano Banana 2) by default,
stored in the database and admin-editable at `/admin`.
Authentication is handled by [Clerk](https://clerk.com) — **email + password only**
(no social login), managed via the `clerk` CLI against the `image` application.
Users, styles, and spend tracking live in [Neon](https://neon.tech) Postgres.

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
- **Admin page**: users with `role = 'admin'` get a dedicated `/admin` page (linked from the
  header) showing global API usage (dollars + generation count per day/week/all-time, same
  UTC windows as the spend limits) and user management — approve / revoke, make admin /
  remove admin — backed by `GET|PATCH /api/admin/users`. Admin rights are checked against
  the database on every admin request, and non-admins who visit `/admin` see an
  "Admin access required" notice. Admins cannot revoke their own access or demote themselves.
- **Enforcement**: `POST /api/generate` rejects non-approved users with
  `403 access_pending` — "Please ask an admin to grant you access."

## Spending limits

Every generation's exact cost is captured from OpenRouter (`usage.cost`; a conservative
estimate is recorded if telemetry is unavailable) into the `generations` table, and
enforced **per user** before any upstream call.

Limits are **data, not code**: they live in the Neon `settings` table
(`limit_daily`, `limit_weekly`, `limit_total`) and admins can edit them on the
`/admin` page ("Spend limits · per user" card). Changes apply to every user
immediately on their next generation attempt. `DEFAULT_SPEND_LIMITS` in
`src/lib/limits.ts` only seeds the table and acts as a fallback if a setting is
missing or unreadable.

Defaults:

| Window | Default | Reset |
| --- | --- | --- |
| Daily | $1.00 | midnight UTC |
| Weekly | $2.00 | Monday 00:00 UTC |
| Lifetime | $3.00 | never |

- Exhausted budgets return `429 budget_exhausted` with a friendly message and the
  current usage and limits, so the client can update immediately.
- Signed-in users see a **usage meter** (Today / This week / All time) with used,
  remaining, and reset info; it refreshes after every generation via the `usage`
  and `limits` fields on both success and limit-reached responses.
- `src/lib/limits.ts` holds the shared types and helpers (`LimitSet`,
  `findHitLimit`, `budgetMessage`); the numeric values are read from the DB and
  delivered to the client through `/api/me`, the generate responses, and
  `/api/admin/*`, so client and server can never drift.

## Image model

The OpenRouter model is **stored in the database, not the environment**: the
`settings` table holds an `image_model` key (default
`google/gemini-3.1-flash-image`), and admins can change it on the `/admin`
page ("Image model" card). It applies to every generation from the next
request onward. `DEFAULT_MODEL` in `src/lib/constants.ts` only seeds/falls
back when the setting is missing or unreadable.

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
- **Styles are data, not code — they live in the database.** The `styles` table in Neon
  holds every style (`id`, `name`, `tagline`, `emoji`, `gradient`, `scene_prompt`,
  `enabled`). Admins manage them at `/admin` (edit prompts, enable/disable, add,
  delete) and changes apply immediately — no deploy. The database stores only the
  scene part; the shared `IDENTITY_PRESERVATION` contract is appended by the server
  (`composePrompt`), so no edit can weaken it. `src/lib/styles.ts` keeps the shared
  types plus the `DEFAULT_STYLES` seed used to bootstrap an empty table.

## Project layout

```
src/
  app/
    api/generate/route.ts   # POST endpoint: auth, access, budget, rate limit, OpenRouter
    api/me/route.ts         # access status + usage + limits for the signed-in user
    api/admin/users/route.ts# admin-only list/approve/revoke/role management
    api/admin/settings/route.ts # admin-only spend-limit + image-model get/update
    api/admin/styles/route.ts + [id]/route.ts # admin-only style CRUD
    api/styles/route.ts     # public enabled-styles registry (also feeds the docs page)
    admin/page.tsx          # admin-only user management page (/admin)
    layout.tsx / page.tsx   # shell + marketing header
    globals.css             # Tailwind v4 theme, dark studio look
  components/
    ImageStudio.tsx         # orchestrates state + fetch
    ImageUploader.tsx       # drag & drop, click, clipboard paste
    StylePicker.tsx         # style cards (data-driven)
    ResultPanel.tsx         # result, download, error states
    UsageMeter.tsx          # daily/weekly/lifetime spend bars
    AdminUsers.tsx          # /admin page content (usage, limits, model, user list + actions)
    AdminStyles.tsx         # /admin styles manager (edit/enable/disable/add/delete)
    AdminNavLink.tsx        # header link, shown only to admins
  lib/
    styles.ts               # style types, identity contract, DEFAULT_STYLES seed
    api.ts                  # shared client/server API contract
    limits.ts               # spend-limit types + helpers (server & client)
    db.ts                   # Neon Postgres access (users, generations, settings, styles)
    openrouter.ts           # server-only OpenRouter client
    image-client.ts         # browser-side validation/downscale
    rate-limit.ts           # per-IP fixed-window limiter (in-memory)
    constants.ts
```

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | yes | OpenRouter API key |
| `OPENROUTER_BASE_URL` | no | OpenRouter-compatible endpoint override |
| `APP_URL` | no | Sent to OpenRouter as `HTTP-Referer` for attribution |
| `DATABASE_URL` | yes | Neon Postgres connection string (project `image`). The image model lives in its `settings` table, not here |
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
