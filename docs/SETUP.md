# Pemby setup record

What exists outside this repo, who owns it, and which environment variables it provides.
**Names only. No secret values ever go in this file.** Last updated 2026-09-16 (phase 00).

## Where values live

- **Railway shared variables** in project `pemby`, one set per environment (`production`, `staging`).
  Services created in phase 01 reference them.
- **The owner's local gitignored files**: `.env` (both environments), `.env.production`, `.env.staging`,
  and later `.env.development` (local only, never pushed). The lead reads variable names only and
  pushes values to Railway with a script that never prints them.

## Accounts

| # | Service | Status | Owner / location | Env vars provided | Stored in |
|---|---|---|---|---|---|
| 1 | GitHub repo | done | `stephen-golban/pemby`, public, `origin` of the local repo | none | none |
| 2 | Railway | done | project `pemby` (Hobby); staging has Postgres 18 + pgvector, bucket `pemby-cvs`, web, worker, bot; production empty | `DATABASE_URL`, `DATABASE_PUBLIC_URL`, bucket credentials (`${{pemby-cvs.*}}`) | Railway staging |
| 3a | Cloudflare DNS | done | zone `pemby.app` on Cloudflare nameservers | none | none |
| 3b | Cloudflare Turnstile | done | one widget for `pemby.app`, `staging.pemby.app` | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Railway, both envs |
| 3c | Cloudflare Email Routing | done | `hello@pemby.app` forwards to the owner's inbox; test mail received 2026-09-16 | none | none |
| 4 | OpenRouter | done | owner's personal account, $10+ credit, default workspace | `OPENROUTER_KEY_PUBLIC`, `OPENROUTER_KEY_PRIVATE` | Railway, both envs (**same keys**, see notes) |
| 5a | Telegram bots | done | `@pemby_app_bot` (production), `@pemby_app_staging_bot` (staging) | `TELEGRAM_BOT_TOKEN` (different per env), `OWNER_TELEGRAM_CHAT_ID` | Railway: token per env; chat id both envs |
| 5b | Telegram channel | done | `@pemby_jobs` "Pemby Jobs"; production bot is admin (post, edit, delete) | `TELEGRAM_PUBLIC_CHANNEL` | Railway, production |
| 6 | Resend | done | domain `pemby.app`, region eu-west-1; owner reports verified; DKIM, `send.` and DMARC records resolve | `RESEND_API_KEY` (different per env, sending access only) | Railway, per env |
| 7 | GitHub + Google OAuth apps | **deferred** | owner decision 2026-09-16: after trying the product | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (planned) | none |
| 8 | Sentry, PostHog | **deferred** | same decision; add one at a time later | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST` (planned) | none |
| 9 | Dodo + Paddle pre-clearance | **sent 2026-09-16, awaiting replies** | owner, from `hello@syncra.studio`. Dodo: email to `compliance@dodopayments.com` (the route in Dodo's merchant acceptance policy), sent 2026-09-16. Paddle: no email route for prospective sellers; request submitted through the paddle.com/demo form on 2026-09-16 ("Launch a new product with payments built in", team "Just me"); the pre-clearance text goes in the reply to Paddle's sales email | none | none |
| 10 | Accountant call (IT Park, CAEM 58.29 / 63.11) | **pending** | owner; questions at the end of `docs/research/11-it-park-eligibility.md` | none | none |
| 11 | rabota.md / DOU partnership emails | **pending** (optional) | owner | none | none |

## Notes and verified facts

**OpenRouter** (verified 2026-09-16 with live one-word calls, no personal data)
- Account privacy: free endpoints that train on inputs **allowed** (needed for free Nemotron); paid
  training off; account-level ZDR off.
- Guardrail `pii-zdr` is assigned to `pemby-prod-private` only: ZDR on for all five model groups;
  free training, paid training and prompt publication off.
- Proof: the private key calling `nvidia/nemotron-3-super-120b-a12b:free` gets 404 "Free model training
  violation (guardrail)"; the public key gets 200. With the private key, Claude Haiku 4.5
  (via Bedrock), Gemini 2.5 Flash Lite, `qwen/qwen3-embedding-8b` (DeepInfra) and `openai/gpt-oss-120b`
  all succeed, so every PLAN D19 model has a ZDR route. The guardrail's Models tab does not list
  embedding models; that is a UI omission, not ineligibility.
- Both keys have a $50 monthly limit. The free-model quota is 1,000 requests a day.
- **Staging uses the production keys** (owner decision: no separate OpenRouter workspace). Staging
  spend and free-model quota count against production's.
- Keep `provider: { zdr: true }` on every personal-data request anyway (PLAN D17).

**Email**: Email Routing owns the root MX and SPF. Resend sends from the `send.pemby.app` subdomain. Do
not add other root MX or SPF records.

**Telegram**: the owner's chat id is stored in Railway, not written here. The staging bot is not in the
channel.

**OAuth callback URLs** (for when step 7 resumes; phase 01 or later confirms Better Auth's path):
`https://pemby.app/api/auth/callback/{github,google}` and the same on `staging.pemby.app`. GitHub
needs a third app for `http://localhost:3000`; one Google client can hold staging and localhost.

**Generated in phase 01 (never seen by anyone):** `BETTER_AUTH_SECRET`, `STAGING_BASIC_AUTH_USER`,
`STAGING_BASIC_AUTH_PASSWORD` (staging shared variables); `TELEGRAM_WEBHOOK_SECRET` (staging bot
service). Private config: `PRIVATE_CONFIG_TOKEN` (fine-grained, Contents read-only on
`stephen-golban/pemby-private`, expires in about a year), `PRIVATE_CONFIG_REPO`, `PRIVATE_CONFIG_REF`.
Better Auth routes live under `/api/auth/*`; OAuth callbacks will be `/api/auth/callback/<provider>`.

**Payment provider approvals**: none yet. Pre-clearance sent to Dodo and Paddle on 2026-09-16 (row 9); applications wait until pemby.app is live with pricing, terms, privacy and refund pages. Phase 10 needs one approval recorded here before passes go live.
