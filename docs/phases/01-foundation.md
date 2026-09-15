# Phase 01: foundation

Read `docs/phases/_COMMON.md` first.

## Read first

- `docs/PLAN.md` sections 2 (D17–D25), 3, 7
- `docs/SETUP.md` and `docs/phases/handoffs/00-handoff.md`
- `docs/research/07-openrouter-integration.md` (SDK choice only)
- `docs/research/08-hirify-and-telegram.md` (bot hosting notes only)

## Goal

A deployable, empty-but-real Pemby: monorepo, schema v1, auth, i18n, private config, CI, and Railway
production plus staging environments serving a placeholder page. Also the progress page and repo
conventions every later phase relies on.

## In scope

1. **Monorepo.** pnpm + Turborepo with the layout in PLAN section 3. Check current stable versions of
   Next.js, React, Drizzle, pg-boss, Better Auth, TanStack Query, grammY, Vercel AI SDK and
   `@openrouter/ai-sdk-provider` on their official docs or npm before pinning. TypeScript strict. ESLint
   and Prettier. Root scripts: `typecheck`, `lint`, `build`, `dev`.
2. **Database.** `packages/db` with Drizzle schema v1 for all tables in PLAN section 3 (columns can
   grow later), migrations, and a seed script that creates realistic demo data for staging (label demo
   companies and people as fictional). Confirm pgvector is available on Railway Postgres, or pick a
   pgvector-capable Railway Postgres template, and enable the extension in schema v1.
3. **Auth.** Better Auth in `apps/web` with GitHub, Google, email magic link (via Resend) and anonymous
   sessions that can be claimed on signup. Confirm the anonymous plugin exists in the current version and
   how account linking works. Record the exact OAuth callback URLs in `docs/SETUP.md` so the owner can
   finish the OAuth apps.
4. **i18n.** Choose and wire an i18n library for the App Router with English only. All strings go
   through it from day one.
5. **Optimistic UI base.** TanStack Query provider and one documented pattern (a small helper or a
   written example in `docs/conventions.md`) for optimistic mutations with rollback.
6. **Private config (PLAN D23).** Decide how prompts, scoring weights and source lists reach Railway
   builds without being in the public repo. Options: private git submodule pulled with a deploy token,
   runtime fetch from a private repo, or Railway variables/volumes. Check what Railway supports, pick
   one, implement a loader in `packages/ai` and `packages/core`, and document it.
7. **Services on Railway.** `web`, `worker`, `bot` (the bot and worker can be stubs that boot and log),
   Postgres, a bucket. Environments `production` and `staging`. Domains `pemby.app` and
   `staging.pemby.app` through Cloudflare. Staging is password protected (basic auth or an equivalent
   middleware check) and seeded with demo data. The protection exempts webhook routes such as
   `/api/webhooks/*`, auth callbacks and the bot service's webhook endpoint, which rely on signature or
   secret-token verification instead. Use the `use-railway` skill.
8. **CI.** GitHub Actions running typecheck, lint and build on PRs and main. No test jobs.
9. **Observability.** Sentry and PostHog wired with env vars, disabled when unset.
10. **Repo hygiene.** `LICENSE` (AGPL-3.0), `README.md` (short, honest, founder story placeholder),
    `CLAUDE.md` for the repo (commands, layout, the hard rules from `_COMMON.md` condensed), `.env.example`
    with names only, `docs/conventions.md`.
11. **Progress page.** Create the progress artifact (load the `artifact-design` skill first). It is
    private and shows phase status for 00–13, what shipped, staging links and open decisions. Save its
    URL and the staging access instructions in `docs/PROGRESS.md`.
12. **Owner-only access gate.** In production, product routes are reachable only by allowlisted
    accounts until phase 11 opens the beta. Product routes are everything except landing, pricing,
    legal, SEO, auth callbacks and webhooks.

## Out of scope

Any real UI design (phase 02/03 own that; the placeholder page is plain text), ATS connectors, AI calls.

## Suggested work orders

Run in parallel where ownership allows:
- A (opus): monorepo scaffold, tooling, CI, repo hygiene files. Owns root config, `.github/`, `LICENSE`, `README.md`, `CLAUDE.md`.
- B (opus): `packages/db` schema v1 with pgvector enabled, migrations, seed. Owns `packages/db/`.
- C (opus): auth, owner-only access gate, i18n, optimistic pattern in `apps/web`. Owns `apps/web/` (after A lands the skeleton).
- D (opus): private config mechanism plus `packages/ai` and `packages/core` skeletons. Owns those packages.
- E (opus): Railway services, environments, domains, staging protection. Owns `railway.*`/deploy config and Railway itself. Runs after A, B and C merge.
The lead builds the progress page.

## Checkpoint with the owner

Show pemby.app and staging.pemby.app responding, a GitHub login working on staging, and the progress page.

## Definition of done

- `pnpm typecheck && pnpm lint && pnpm build` pass locally and in CI (show exit codes and the CI run link).
- Both domains serve over HTTPS; staging asks for the password, except on webhook routes, auth callbacks and the bot webhook endpoint, which respond without it and verify signatures or secret tokens.
- Signing in with GitHub, Google and a magic link works on staging; an anonymous session is created and claimed after signup.
- On production, a non-allowlisted account is refused on a product route, while landing, legal, auth callback and webhook routes stay reachable.
- Migrations run on both Railway databases with the pgvector extension enabled; staging has seed data.
- Private config loads on Railway without being in git (show `git grep` finding nothing).
- `docs/PROGRESS.md` holds the progress page URL.
- Handoff written.
