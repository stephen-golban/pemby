# Pemby conventions

Rules every phase follows. Product decisions are in `docs/PLAN.md`; phase rules in
`docs/phases/_COMMON.md`.

## Package layout

- Workspaces: `apps/*` and `packages/*` (`pnpm-workspace.yaml`).
- Package names: `@pemby/web`, `@pemby/worker`, `@pemby/bot`, `@pemby/db`, `@pemby/core`,
  `@pemby/ai`. New packages follow `@pemby/<dir>`.
- Every package is `"private": true` and `"type": "module"`.
- Every package has a `tsconfig.json` that extends `tsconfig.base.json` (strict,
  `noUncheckedIndexedAccess`, bundler resolution, `verbatimModuleSyntax`, ES2023).
- Depend on another workspace package with `"@pemby/<name>": "workspace:*"`.

## Internal packages are TypeScript source

- Internal packages export source: `"exports": { ".": "./src/index.ts" }`. There is no build step
  and no `dist/`.
- `apps/web` compiles them through `transpilePackages` in `next.config.ts`. Add new packages there.
- `apps/worker` and `apps/bot` run TypeScript with `tsx` in production (`tsx src/index.ts`), so they
  import the same source directly.
- Use `import type` for type-only imports (`verbatimModuleSyntax` and the lint rule enforce it).

## Scripts

| Script | Where | What |
|---|---|---|
| `typecheck` | every package | `tsc --noEmit` (`apps/web` runs `next typegen` first) |
| `lint` | every package | `eslint .` with the root flat config (`apps/web` adds Next.js rules) |
| `build` | `apps/web` | `next build` |
| `dev` | apps | `next dev`, or `tsx watch src/index.ts` |
| `start` | apps | `next start`, or `tsx src/index.ts` |

Root scripts run through Turborepo: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm dev`.
`pnpm format` and `pnpm format:check` run Prettier over the repo (docs, `.impeccable/`,
`PRODUCT.md` and `LICENSE` are excluded). There are no test scripts (PLAN D24).

Dependency versions are exact pins, checked against npm or official docs when added. pnpm's
supply-chain policy (minimum release age) applies; prefer an older patch over excluding a package.

## Environment variables

- `SCREAMING_SNAKE_CASE`. Browser-exposed variables start with `NEXT_PUBLIC_` and must never hold
  secrets.
- Group by service prefix: `OPENROUTER_*`, `TELEGRAM_*`, `PRIVATE_CONFIG_*`, `STAGING_*`,
  `BETTER_AUTH_*`.
- `APP_ENV` is `production`, `staging` or `development`. Do not branch on `NODE_ENV` for this.
- Every new variable is added by name, with an empty value and a comment, to `.env.example`, and to
  the table in `docs/SETUP.md` if an external account provides it.

## No secrets in git

- The repo is public. Never commit `.env*` files (only `.env.example`), keys, tokens, prompts,
  scoring weights or job source lists.
- Before committing, `git grep -nE 'sk-or-|BEGIN (RSA|OPENSSH)|password=' -- . ':!docs'` must find
  nothing.

## Local development gets env from Railway

- Values live in Railway variables, per environment. There are no secret `.env` files to share.
- `scripts/dev-staging.sh <command>` wraps
  `railway run --environment staging --service "${RAILWAY_SERVICE:-web}"` and points
  `DATABASE_URL` at `DATABASE_PUBLIC_URL`, so a laptop can reach the staging database.
- `pnpm dev:staging` runs `pnpm dev` that way. For one service:
  `RAILWAY_SERVICE=worker scripts/dev-staging.sh pnpm --filter @pemby/worker dev`.
- Needs `railway login` and `railway link` to project `pemby` first.

## Commit messages

- Imperative summary under about 72 characters, prefixed with the phase when it belongs to one:
  `Phase 01: monorepo scaffold, CI and repo hygiene`.
- Body explains why, wrapped at about 72 columns.
- Commits made with Claude end with the attribution trailer from the session, for example:

  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  ```

## i18n

_Placeholder: filled by work order C._

## Optimistic UI

_Placeholder: filled by work order C._
