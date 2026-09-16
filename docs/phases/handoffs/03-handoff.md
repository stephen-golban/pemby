# Phase 03 handoff: landing, pricing, legal (done, live on pemby.app)

Written 2026-09-17, promotion recorded the same day. Everything is built, reviewed and live on
https://pemby.app. See "Promotion" below; the "Remaining work" list is kept as the record of what ran.

## What shipped (all pushed to `main`, owner-approved)

| Commit | Unit |
|---|---|
| `86a6c17` | Landing hero comp-led, `packages/ui` tokens (light/dark), wordmark, theme toggle, Codex plates |
| `8c861da` | Landing sections below the band, signature motion, `SiteHeader`/`SiteFooter` (also removed the `/legal/*` stubs; see note) |
| `dc088c7` | `/pricing`, `/terms`, `/privacy`, `/refunds`; `/legal/*` 308 redirects; messages split into `messages/en/*.json`; PLAN D14 amendment |
| `e6a5fa5` | Responsive pass, SEO (metadata, OG/Twitter image, icons, sitemap, env-aware robots), wording review fixes |
| `263d280` | Finish review fixes, `DESIGN.md`, `.impeccable/design.json` |

`8c861da` alone does not build (it deleted `ComingSoon` before pricing stopped importing it); `dc088c7`
fixed it minutes later and CI cancelled the broken run.

## Remaining work for the next session

1. **Attach the domain** (use the `use-railway` skill):
   `railway domain pemby.app --environment production --service web --port 8080`, add the returned
   record in Cloudflare with proxy **off** (grey cloud), wait for the certificate. Decide `www` with the
   owner (redirect to apex or skip).
2. **Verify on https://pemby.app:**
   - `/`, `/pricing`, `/terms`, `/privacy`, `/refunds` return 200 with no auth.
   - `/legal/terms` returns 308.
   - `/robots.txt` allows indexing (production body), `/sitemap.xml` is live.
   - `/app` redirects to sign-in.
   - Owner login works for golban.stephen@gmail.com; the owner signs in themselves, never with the password in chat.
   - Public sign-up is refused.
   - Production deploy is at `263d280` or later.
3. **Optional hardening, ask the owner:** remove the production Postgres TCP proxy and the
   `web-production-df922.up.railway.app` domain now that `create-owner` has run.
4. **Progress page:** publish desktop 1440 and mobile 390 screenshots of pemby.app, mark phase 03 done.
   URL is in `docs/PROGRESS.md`. The phase 04 session also edits this page, so re-read it before
   publishing and merge.
5. **Close-out:** `docs/PLAN.md` section 7 status for 03, then owner approval for the commit. Point the
   owner at phase 05 (or 06) per the phase table.

## Promotion (2026-09-17)

- `pemby.app` attached to production `web` (port 8080). Cloudflare: `CNAME @ uugvmwfw.up.railway.app`
  DNS only, plus the `_railway-verify` TXT. Certificate issued within minutes.
- `www`: owner chose a Cloudflare-side redirect (proxied `A www 192.0.2.1` plus a 301 redirect rule to the
  apex, `https://www.pemby.app/*` to `https://pemby.app/${1}`, query string kept) and "Always Use HTTPS"
  on. Verified: http and https www requests end at `https://pemby.app/<path>?<query>` (200).
- Verified live: `/`, `/pricing`, `/terms`, `/privacy`, `/refunds` 200 with no auth; `/legal/terms` 308;
  `/app` 307 to `/sign-in`; `robots.txt` allows indexing with `Sitemap: https://pemby.app/sitemap.xml`;
  sitemap lists 5 `https://pemby.app` URLs; `POST /api/auth/sign-up/email` and anonymous sign-in return
  403 `SIGN_UP_CLOSED`; http to https 301; canonical and OG image on `https://pemby.app`; production
  deploy `263d280`. Owner sign-in is checked by the owner.
- Hardening (owner-approved): production Postgres TCP proxy removed and `DATABASE_PUBLIC_URL` deleted
  from production `web`. Running a one-off script against production (for example `create-owner`) now
  needs a temporary TCP proxy again; remove it afterwards.
- The temporary `*.up.railway.app` domain vanished around the attach (audit log silent); left removed.
- Next: phase 05 (depends on 04, done on staging). Phase 06 needs 03 and 05.

## Production (created this phase)

- **Railway project:** `pemby`, environment `production`. Only these services: `Postgres` (18, pgvector) and
  `web` (id `30762b6b-9f11-4213-8759-b0fda54a36bf`). No worker, bot or bucket yet (owner decision:
  add them in the phase that first needs them).
- **web settings:** mirror staging: build `pnpm --filter @pemby/web build`, start
  `pnpm --filter @pemby/web start`, pre-deploy `pnpm db:migrate`, healthcheck `/api/health`, auto-deploy
  from `main`, `RAILPACK_NODE_VERSION=24`.
- **web variables:** `APP_ENV=production`, `OWNER_GATE=on`, `BETTER_AUTH_URL=https://pemby.app` (sign-in
  only works on that origin), `BETTER_AUTH_SECRET` (new, production-only), `PRIVATE_CONFIG_REF=config-v0.1.0`
  (pinned), `PRIVATE_CONFIG_REPO`, `PRIVATE_CONFIG_TOKEN`, `DATABASE_URL` (`DATABASE_PUBLIC_URL` removed at promotion),
  `OWNER_ALLOWLIST_EMAILS=golban.stephen@gmail.com`.
- **Owner account:** created 2026-09-16 with `create-owner` through `railway run` using
  `DATABASE_PUBLIC_URL`. The script's header comment points at the internal URL; use the public one.
- **Temporary domain:** `https://web-production-df922.up.railway.app`.

## Owner decisions this phase

- **Brand:** wordmark only; display face Rethink Sans 800, picked from a measured proof sheet; mono Source Code Pro.
- **Card photos:** generated with Codex, prompts embedded (`apps/web/public/landing/`); all example content labelled.
- **Legal URLs:** top-level legal URLs.
- **Company details:** operator "SYNCRA" S.R.L., IDNO 1025605006423. **The registered street address is the
  owner's home and must never be published**; public pages say "Chișinău, Republic of Moldova".
- **Refunds:** 14 days on every provider (PLAN D14 and phase 10 amended).
- **Payment applications:** apply to Dodo and Paddle **after phase 06**, when the CV drop and free flow work
  (not right after this phase, as PLAN section 7 suggested). The pre-clearance emails were sent
  2026-09-16 (`docs/SETUP.md`), and a separate session guides the owner through them.
- **Telegram:** off the top nav, framed as example matches. Chrome extension removed from passes until it ships.
- **Gate overrides:** hero gate and responsive gate force-advanced on the owner's words (wordmark, photo-framing
  drift, opened spacing). Dark olive field `#272d20` approved over the contract's `#1e2419`.
- **Proposed copy:**
  - Drop-zone stand-in: "CV reading is not switched on here yet", nothing uploaded or read.
  - Pricing: "Not on sale yet · Nobody is charged".

## Reviews

- **Blind wording review:** no D16 violations. 15 findings; the owner decided 3, and the rest were fixed or rejected
  (headline kept). Result in `e6a5fa5`.
- **Finish review** (`impeccable-finish-reviewer`): fix, then fix, then **ship**. Scope: the six fixes and one
  caption regression. Motion was never judged (all captures used reduced motion). The detector returned `[]`,
  and all 5 rasters carry provenance.
- **Code:** no adversarial code review (presentational, static pages; the only access change adds public
  legal routes).

## New dependencies, files, env

- **Dependencies:** `react-markdown` 10.1.0, `remark-gfm` 4.0.1 (pinned). Fonts vendored for `next/og` in `apps/web/app/_og/`
  (OFL texts alongside).
- **Messages:** `messages/<locale>.json` deep-merged with `messages/<locale>/*.json` (`i18n/request.ts`);
  `global.d.ts` types both.
- **Legal:** markdown in `apps/web/content/legal/en/`; effective date constant in `content/legal/meta.ts`
  (`16 September 2026`). Update it if the text changes before launch.
- **Env:** no new env vars.

## UNVERIFIED and open items

- **Legal drafts are reviewed by nobody with legal training.** Get a lawyer's read before public
  launch. Open items are in `apps/web/content/legal/NOTES.md` section C:
  - GDPR art. 27 EU representative
  - transfer safeguards and DPAs
  - Moldovan accounting retention period (accountant call)
  - Railway data region and the 30-day backup claim
  - minimum age 16
  - liability cap
  - Turnstile and cookie consent
  - whether EU rules require a physical business address, which argues for a virtual office for the SRL seat
- **Proposed terms awaiting owner acceptance:** 13 of them (NOTES.md section C), e.g. 30/90/180-day passes,
  reply within 3 business days, 30 days' notice on shutdown.
- **IT Park resident status:** unconfirmed. The claim was removed from the legal pages.

## Known issues and notes for later phases

- **Design token drift** reported by the documenter, not repaired (and a small cleanup order, not urgent):
  - card radius 30px is hard-coded and not a token
  - the EXAMPLE stamp is defined twice with literal colours
  - pricing restates rhythm clamps
  - off-scale font sizes, no weight-600 token
  - nine untokenised breakpoints
- **Impeccable build state:** `.impeccable/build/` and `.impeccable/review/` are gitignored and exist only on this machine;
  the finish is recorded there.
- **Surface brief lookup:** `impeccable context` does not find the surface brief at the repo root (it looks under
  `apps/web`); read `.impeccable/surfaces/apps-web-app-page-tsx.md` directly.
- **Codex image generation:** run with `</dev/null`; `comp-spec --crop` produced blank crops (memory notes).
- **Local `next start`:** returns 500 on every page unless `APP_ENV` is set.
- **Staging `robots.txt`:** sits behind the staging password (still blocks crawlers).
- **Parallel sessions:** phase 04 runs in parallel and pushes to `main`; always fetch and rebase before pushing, and check
  `git diff --cached` before splitting commits. Its production ingestion needs a worker service in
  production, which is the owner's call.
- **Phase 06 must:** wire the real CV drop in `apps/web/components/landing/drop-zone.tsx` (optimistic UI),
  reopen sign-up with email verification, and restore present-tense copy about CV reading.
- **Phase 10 must:** name the approved provider in `privacy.md` and pricing, and add the Chrome extension back
  only when it ships (three places, per NOTES.md).
