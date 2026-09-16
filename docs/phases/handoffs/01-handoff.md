# Phase 01 handoff: foundation

Completed 2026-09-16. The owner signed up on staging, used `/app` and saw the optimistic update
roll back ("everything seems to be working").

## What shipped (all pushed, CI green on each)

| Commit | Unit |
|---|---|
| `1aea663` | A: pnpm 12 + Turborepo monorepo, strict TS 6.0.3, ESLint 9, Prettier, CI (typecheck, lint, build), LICENSE, README, CLAUDE.md, `.env.example`, `docs/conventions.md` |
| `cf8bb57` | B + D: `packages/db` schema v1 (23 tables, Better Auth tables, pgvector `halfvec(2048)` + HNSW), migrations, fail-closed seed; `packages/core` private-config loader and shared AI constants; `packages/ai` OpenRouter key routing with enforced ZDR |
| `735200a` | C: Better Auth (email+password, anonymous), anonymous claim, `apps/web/proxy.ts` (staging basic auth, owner gate), production sign-up closed + `create-owner` script, next-intl, TanStack Query optimistic pattern |
| `0fc734e` | E2: worker/bot load private config at boot, bot webhook secret, `turbo.json` loose env mode |

Blind adversarial reviews ran on B+D (12 findings: 10 fixed, 2 deferred below) and on C
(7 findings, all fixed). Details live in the commit bodies and in code comments at each fix.

## Deviations from the phase file, and why

1. **Staging only.** The owner wants to try the product before paying for production. The
   production environment has no services; `pemby.app` serves nothing yet. Phase 03 adds them.
2. **Auth is email+password plus anonymous.** GitHub, Google, magic link, Sentry and PostHog are
   deferred until after the owner has tried the product (owner decision; PLAN D20 amended).
3. **Production refuses public sign-ups** until the beta (a security review found that without
   email verification anyone could register the owner's allowlisted email). Owner accounts come
   from `pnpm --filter @pemby/web create-owner` run through `railway run` against production.
   Phase 06 must reopen sign-up with email verification.
4. **Local dev uses the staging database** through `scripts/dev-staging.sh`; there is no local
   Postgres.
5. **No Railway config-as-code in the repo.** `railway.json` is deprecated. Its replacement
   `.railway/railway.ts` describes a whole environment and this checkout is linked to production,
   so an apply is risky. Service settings live on Railway (below).
6. **The progress page has no screenshots yet.** The only screens are unstyled placeholders.

## Private config (PLAN D23)

Private repo `stephen-golban/pemby-private`, tag `config-v0.1.0` (commit `f4748e9`), with stub
prompts, weights at the PLAN thresholds and empty source lists. It is loaded at boot over the GitHub
API with a read-only fine-grained token; its scope was verified (other private repos return 404).
See `docs/private-config.md`. Real prompts arrive in phases 05 and 09. Pin production's
`PRIVATE_CONFIG_REF` to a tag.

## Railway staging (project `pemby`, Hobby)

- **Services:** `Postgres` (18.6, pgvector 0.8.6), `web`, `worker`, `bot`, bucket `pemby-cvs`
  (not yet wired). All deploy from GitHub `main` automatically, and watch paths limit redeploys.
- **web:**
  - build `pnpm --filter @pemby/web build`, start `pnpm --filter @pemby/web start`
  - pre-deploy `pnpm db:migrate`, healthcheck `/api/health`
- **worker / bot:**
  - build: typecheck; start `pnpm --filter @pemby/<app> start`
  - bot healthcheck `/health`
- `RAILPACK_NODE_VERSION=24` is set on every service.
- **Domains:**
  - `https://staging.pemby.app` (Cloudflare CNAME, DNS only, grey cloud)
  - temporary `web-staging-331e.up.railway.app`
  - `bot-staging-45f9.up.railway.app` (for the future webhook)
- **Shared variables must be referenced per service** (`${{shared.NAME}}`); they are not
  injected automatically.

## New env vars

`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `BETTER_AUTH_TRUSTED_ORIGINS` (optional),
`STAGING_BASIC_AUTH_USER`, `STAGING_BASIC_AUTH_PASSWORD`, `OWNER_ALLOWLIST_EMAILS`, `OWNER_GATE`,
`APP_ENV`, `PRIVATE_CONFIG_REPO`, `PRIVATE_CONFIG_REF`, `PRIVATE_CONFIG_TOKEN`,
`PRIVATE_CONFIG_DIR`, `TELEGRAM_WEBHOOK_SECRET`, `DATABASE_URL`, `DATABASE_PUBLIC_URL`,
`RAILPACK_NODE_VERSION`. Names are in `.env.example` and `docs/SETUP.md`.

## Verified facts (resolved UNVERIFIED items)

- OpenRouter honours `dimensions: 2048` for `qwen/qwen3-embedding-8b` (normalised output). The
  private key with ZDR reaches every PLAN D19 model.
- Better Auth 1.7.5: `onLinkAccount` runs before the plugin's delete. The claim now deletes the
  anonymous user itself, inside its transaction (`disableDeleteAnonymousUser`). The OAuth callback
  path pattern is `/api/auth/callback/<provider>` (not yet exercised).
- Railway's default Postgres 18 image ships pgvector.

## Known issues and open items

- Rate limiting reads `X-Real-IP`. Per-client isolation on Railway is unverified, and it breaks
  if Cloudflare proxying is turned on (switch to `CF-Connecting-IP` and drop the public Railway
  domain in that case).
- Claim paths for matches, kits and delivery rows are written but untested on real rows. Exercise
  them in phases 06–09.
- AI SDK `APICallError` carries request bodies (CV text): scrub before any logging or Sentry
  (phase 05/09).
- Delivery needs a claim-before-send row to stop double sends from concurrent dispatchers
  (phase 08).
- `apps/web` uses parameterised raw SQL because pnpm resolves a second `drizzle-orm` copy for web.
  Exporting operators from `@pemby/db` would restore typed queries.
- next-intl sends the whole message file to the client.
- `OWNER_ALLOWLIST_EMAILS` is not set anywhere yet. The owner must name the email before
  production exists.
- Still pending with the owner: Dodo/Paddle pre-clearance emails, the accountant call.

## Notes for phase 03

- Production services, the `pemby.app` domain (grey cloud), a pinned `PRIVATE_CONFIG_REF` and
  `OWNER_ALLOWLIST_EMAILS` all have to be created when the landing page ships. Mirror staging's
  service settings above, then run `create-owner`.
- `apps/web/app/page.tsx` is the landing route the surface brief targets. Public routes are
  `lib/access/paths.ts`, and all copy goes through `apps/web/messages/en.json`.
- The progress page URL is in `docs/PROGRESS.md`.
