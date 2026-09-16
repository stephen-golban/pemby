# Pemby

AI job-matching software; you apply yourself.

Pemby is for tech people in countries that "remote" jobs quietly exclude, starting with Moldova.
You drop your CV and confirm a few details. Pemby sends you only the roles that can legally hire
from your country and fit you, with the reason shown. When nothing fits, it says so. You apply
yourself, on the company's own site.

## Status

Early, not live yet. This repository is being built in public.

## Stack

Planned, and being wired in phase by phase: TypeScript monorepo (pnpm, Turborepo), Next.js App Router, Postgres with Drizzle, pg-boss, Better
Auth, grammY, Vercel AI SDK with OpenRouter, hosted on Railway.

```
apps/web        Next.js app
apps/worker     background jobs
apps/bot        Telegram webhook service
packages/db     database schema and migrations
packages/core   matching and eligibility logic
packages/ai     model client and prompt loading
```

## Running locally

Requires Node 24 and pnpm (the version is pinned in `package.json`; Corepack or pnpm picks it up).

```sh
pnpm install
PRIVATE_CONFIG_DIR=./private-config.example pnpm dev   # all apps, placeholder config, development only
pnpm typecheck
pnpm lint
pnpm build
```

Environment variables are not kept in files. Maintainers with Railway access run against the
staging environment through the Railway CLI:

```sh
railway login
railway link        # project "pemby"
pnpm dev:staging    # runs `pnpm dev` with staging variables injected
```

`.env.example` lists every variable name.

## What is not in this repo

Prompts, scoring weights and job source lists live in a private config repository and are loaded
at deploy time. Keys and secrets live in Railway. Neither is committed here.

## Founder story

<!-- PLACEHOLDER: the founder's own story goes here, written by the founder. -->

_Coming soon._

## License

[AGPL-3.0](./LICENSE)
