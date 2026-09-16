# Pemby: working notes for Claude

Pemby is AI job-matching software; you apply yourself. Public repo, AGPL-3.0.
Decisions: `docs/PLAN.md`. Phase rules: `docs/phases/_COMMON.md`. Conventions: `docs/conventions.md`.

## Commands

```sh
pnpm install
pnpm dev                 # turbo: web (3000), bot (3001), worker
pnpm dev:staging         # same, with Railway staging variables injected (scripts/dev-staging.sh)
pnpm typecheck           # turbo: tsc --noEmit everywhere (web runs next typegen first)
pnpm lint                # turbo: eslint . everywhere
pnpm build               # turbo: next build
pnpm format              # prettier --write .
pnpm format:check
pnpm --filter @pemby/web <script>   # one package
```

## Layout

```
apps/web        @pemby/web     Next.js App Router (landing, product, admin, webhooks)
apps/worker     @pemby/worker  queues; runs TS via tsx, no compile step
apps/bot        @pemby/bot     Telegram webhook service; runs TS via tsx
packages/db     @pemby/db      Drizzle schema, migrations, seed
packages/core   @pemby/core    eligibility, gates, scoring, entitlements
packages/ai     @pemby/ai      OpenRouter client, key routing, cost cap, prompt loading
docs/           plan, phases, handoffs, research
```

Internal packages export TypeScript source (`"exports": { ".": "./src/index.ts" }`), have no
build step, and are listed in `transpilePackages` in `apps/web/next.config.ts`.

## Hard rules

- **No test suites.** No unit, integration or E2E tests, no test runners. Proof is typecheck, lint,
  build and a real run (browser for UI, curl or a script for APIs and workers). Only exception: `eval/`.
- **Optimistic UI.** Every user mutation updates the screen at once and rolls back on failure
  (TanStack Query `onMutate` + rollback, or React `useOptimistic`).
- **Design only through the `impeccable` skill.** desertant.com is the binding brand reference.
- **Never use Higgsfield.** Images come from Codex CLI (see `docs/phases/_COMMON.md`).
- **Wording (PLAN D16).** Pemby is "AI job-matching software; you apply yourself". Never say job
  board, recruiter, recruitment, placement, get hired, guaranteed job, auto-apply, scrape, beat the
  ATS, or "we write your CV". Applies to UI, emails, bot messages, metadata, posts.
- **Privacy.** Personal data (CVs, profiles, kits, CV embeddings) only goes through the private
  OpenRouter key with ZDR (`provider: { zdr: true }`). The public key only sees public job posts.
  Extract CV text ourselves; never send files to OpenRouter PDF plugins.
- **Public repo.** Never commit secrets, `.env` files, prompts, scoring weights or source lists.
  Those come from the private config repo (`PRIVATE_CONFIG_*`) or Railway variables.
- **i18n.** Every user-facing string goes through the i18n layer. English first.
- **Verify before relying.** Check library versions and APIs against current docs or npm, not memory.
  Pin exact versions.
- **Railway** work uses the `use-railway` skill. Never run `gh auth switch`.

## Environment

Values live in Railway, not in files. `.env.example` lists names. Local runs against staging use
`railway run` via `scripts/dev-staging.sh`, which maps `DATABASE_URL` to the public proxy URL.
