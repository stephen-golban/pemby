# Pemby plan

Status: agreed with the owner on 2026-09-15 through a grill-me interview. Nothing is built yet.
Domain: pemby.app. Operator: the owner's Moldova IT Park SRL (Syncra Studio, www.syncra.studio).

This file is the source of truth for product decisions. Phase sessions read it and never reopen a
decision here without asking the owner. Research behind each decision lives in `docs/research/`.

## 1. The product in one paragraph

Pemby is AI job-matching software for tech people in countries that "remote" jobs quietly exclude:
Moldova first, then Ukraine, Georgia, Armenia, the Balkans, LATAM, Africa and South Asia. You drop
your CV, confirm a few pre-filled cards, and Pemby sends you only the jobs that can legally hire
you from your country and actually fit you, the moment they appear, over Telegram, email or web
push. There is no feed. When nothing matches, Pemby says so and shows what is blocking the near
misses. You apply yourself, with a tailored application kit that takes about a minute to paste.

What nobody else does (research 01, 02, 03, 08):
- Eligibility per country and per way of working, with the reason shown. No existing board
  models this. None of the major ATS job-board APIs has a "countries we hire from" field.
- Jobs re-verified live on the company's own ATS board at least every 12 hours, so ghost and stale jobs drop out.
- Honest silence instead of an infinite feed.

## 2. Decision log

| # | Decision | Detail |
|---|---|---|
| D1 | Audience | Job seekers only. No employer accounts in the MVP. |
| D2 | Eligibility model | Tiered: green "hires from your country", yellow "likely", white "unclear", red "excluded". Every label shows its reason. Any user can opt into yellow (amended 2026-09-17, see D13); it is always labelled distinctly from green and carries its own reason. White and red never show. |
| D3 | Ways of working | B2B contractor, employee via EOR, relocation with visa, freelance, local (on-site or hybrid in your own country), paid programs (stipend internships and mentorships). Defaults: B2B plus EOR for middle and up; local plus programs are added for juniors and interns. |
| D4 | Signup | CV first, no account needed. Parsed profile plus "N roles hire from your country, here are 3" teaser, then sign up to save (GitHub, Google, email magic link). Unclaimed anonymous CVs are deleted after 24h. |
| D5 | Onboarding | Three steps of pre-filled cards, one topic per step, with a live match counter: (1) eligibility, required: citizenships, residence, timezone overlap, own company for invoicing, existing permits, English level; (2) ways of working plus full-time, part-time, contract-to-hire; (3) role and money: titles, seniority, stack, minimum rate, dealbreakers. Company preferences and application defaults are asked later, in context. |
| D6 | No feed, a Brief | Only jobs that pass every hard gate and score at least 80/100 are delivered. Hard gates: eligibility tier, accepted way of working, verified live in the last 24h, seniority within one level (tolerant for juniors), no dealbreakers, salary at or above floor when listed. Each match shows top 3 reasons and 1 gap. Actions: Apply, Save, Not for me (with a one-tap reason that tunes future scoring). **Amended 2026-09-19**: the score bar moves from 80 to **75** (private config `config-v0.4.2`, staging only; production stays on `config-v0.3.0`). Measured on staging: of 7,368 enriched open jobs only 4.2% are green-or-yellow for Moldova, and the owner's real profile evaluated 124 candidates for a best score of 67; the whole database held exactly two score-blocked rows, at 67 and 71. Deliberately **not** 67 — that would have fitted the threshold to a single observed job and collapsed the near-miss band of section 4.6. The binding constraint is eligible supply, not the bar, and the change was not expected to produce a match and did not. |
| D7 | Honest silence | When nothing passes, the Brief shows near misses grouped by blocker with one-tap fixes ("6 had no salary listed, show them?"). For juniors it adds a next step such as an upcoming program deadline. |
| D8 | Delivery | Instant, per match, never batched into a digest by default. Channels: Telegram bot (primary), email, web push. Quiet hours per user. |
| D9 | Application help | MVP: in-app application kit (tailored CV bullets, cover letter, screening answers to copy). Phase 2: Chrome extension that fills forms in the user's own browser; the user clicks submit. Never server-side auto-apply, never LinkedIn automation (research 03). |
| D10 | Roles | Engineering (frontend, backend, full-stack, mobile, DevOps/SRE/platform, data, ML/AI, QA/SDET, security) plus adjacent (data analysts and scientists, IT support and sysadmins, solutions architects, engineering managers and tech leads, DevRel, technical writers). All seniorities, intern to principal. Designers, PMs and scrum masters come later. |
| D11 | Juniors | Local and programs ways of working; programs calendar (GSoC, LFX, Outreachy, Canonical graduate roles and others) kept as a data file in the repo; tolerant experience matching; honest silence with a next step; any post asking the candidate for money is blocked. Local boards that forbid scraping (delucru.md, staff.am) are never scraped; rabota.md and DOU only with written permission (research 12). Until one of them grants it, local jobs are best-effort, coming from ATS on-site or hybrid roles located in target countries. |
| D12 | Pricing | One-time passes, no subscriptions, no auto-renew: $5 for 1 month, $10 for 3 months (highlighted), $18 for 6 months. Renewals stack on remaining time. Reminder 5 days before expiry. |
| D13 | Free vs Pass | Free: CV parse, onboarding, Brief with near misses, yellow matches opt-in, all matches delivered 24h late on every channel (late messages say so), 3 application kits per month. Pass: instant delivery, unlimited kits, the Chrome extension when it ships. **Amended 2026-09-17**: yellow opt-in moved from Pass to Free. Measured on 2,924 enriched real staging jobs, the whole 10-country target market held **21** green (job, country) pairs from three employers — Moldova 1, Serbia 7, Georgia 6, Montenegro and Kosovo 0 — against 66 Moldova yellows. Yellow-as-a-paywall was gating an empty free product rather than a premium one, so passes now differentiate on delivery speed, kit quota and the extension alone. Yellow stays visually and verbally distinct from green and always carries its own reason (D2); the engine's tier rules were **not** loosened. |
| D14 | Trust mechanics | No-match guarantee: zero matches in any 14-day stretch of an active pass adds 14 days automatically. "Landed a role?" pauses the pass and offers a share card. The refund window is 14 days on every provider (amended 2026-09-16: was 7 days on Dodo; an EU buyer of a pass keeps the 14-day withdrawal right until the service is fully performed, Directive 2011/83/EU art. 16(a), so a published 7-day window could contradict it). A refund revokes the pass. |
| D15 | Payments | Apply to Dodo Payments and Paddle in parallel, after email pre-clearance. Use whichever approves first. Billing code sits behind a provider-neutral interface. No Stripe (Moldova unsupported), no Polar (bans job boards), no MAIB direct. Payouts by USD SWIFT to the owner's MAIB USD account (research 06, 14). |
| D16 | Wording rules | Pemby is "AI job-matching software; you apply yourself." Never say job board, recruiter, recruitment, placement, get hired, guaranteed job, auto-apply, scrape, beat the ATS, or "we write your CV". The product never claims or implies it got someone a job; user-reported outcomes are phrased as the user's own news. Reasons: merchant-of-record acceptable-use policies (research 14) and IT Park eligibility, where placement (CAEM 78.10) is not an eligible activity (research 11). |
| D17 | AI provider | OpenRouter for every LLM call. Two Pemby keys: a "public" key allowed to use free models that may train on inputs, used only for public job posts; a "private" key with zero data retention enforced, used for anything with personal data. Users may connect their own OpenRouter account through OAuth PKCE (research 07). |
| D18 | Who pays for AI | Pemby pays for job enrichment, one CV parse per person (behind Cloudflare Turnstile and rate limits) and the 3 free kits per month. Matching uses rules plus embeddings with templated reasons, so no per-user LLM cost. Kits beyond the free 3 need a pass or the user's own OpenRouter key. Hard cap: $3/day of Pemby AI spend; when hit, work queues and the owner gets a Telegram alert. |
| D19 | Model routing | Job enrichment: `openai/gpt-oss-120b` (public key, reasoning effort low) with `google/gemini-3.1-flash-lite` fallback (amended 2026-09-17 after the eligibility accuracy check, `eval/reports/2026-09-17-model-comparison.md`: the free Nemotron route failed on 35–52% of posts and its daily quota is shared by staging and production; gpt-oss had the best accuracy with zero false greens at ~$0.36 per 1,000 jobs). Company evidence (careers pages): `google/gemini-3.1-flash-lite` with `openai/gpt-oss-120b` fallback, public key. CV parsing: `google/gemini-2.5-flash-lite`, private key, ZDR. Embeddings for jobs and profiles: `qwen/qwen3-embedding-8b`, private key, ZDR. Kits: `anthropic/claude-haiku-4.5`, private key, ZDR. Final picks depend on the eligibility accuracy check (research 10). Estimated $8–44/month at launch. |
| D20 | Stack | TypeScript monorepo (pnpm + Turborepo). Next.js App Router web app; TanStack Query mutations with rollback plus React `useOptimistic` for optimistic UI everywhere; Postgres on Railway with Drizzle; pg-boss queues; Better Auth (GitHub, Google, magic link, anonymous; amended 2026-09-16: email and password plus anonymous first, OAuth and magic link after the owner has tried the product); Railway bucket for CVs; Resend email; grammY Telegram bot on webhooks; Vercel AI SDK with `@openrouter/ai-sdk-provider`; Sentry and PostHog. |
| D21 | Hosting | Railway: services `web`, `worker`, `bot`, plus Postgres and a bucket; environments `production` (pemby.app) and `staging` (staging.pemby.app, password protected, demo data). Cloudflare DNS, Turnstile, Email Routing (hello@pemby.app). |
| D22 | Language | English at launch, built i18n-ready. Russian is the first added language. |
| D23 | Code | Public GitHub repo under AGPL-3.0, built in public. Prompts, scoring weights, source lists and keys stay out of the public repo; phase 01 picks the mechanism. |
| D24 | Tests | No unit, integration or E2E test suites. Work is proven by typecheck, lint, build and a real run of the changed flow. One exception: the eligibility accuracy check (about 60 hand-labeled real job posts plus a scoring script). |
| D25 | Design | Built only with the /impeccable skill. The binding reference is the two owner-approved comps `.impeccable/mocks/pin-landing.png` and `.impeccable/mocks/pin-brief.png` plus the world written out in PRODUCT.md (amended 2026-09-21: desertant.com was released and no longer binds, its research notes stay as history in research 05; the image the owner first pinned is a third-party page, held locally and never published, so the comps and the prose are the whole durable record). Landing page is comp-first with images generated through Codex CLI; app screens are code-first. Never Higgsfield. |
| D26 | Flags | Users flag jobs (closed/fake, doesn't hire from my country, scam, wrong details, duplicate, other). Worker rules act automatically (see section 6). Before public launch, a daily job opens anonymized GitHub issues about misclassification patterns, and a label-gated Claude Code GitHub Action proposes fix PRs the owner merges (research 13). |
| D27 | Growth | Private beta: referrals (both sides +14 days when the friend uploads a real CV; referrer +30 days when the friend buys), SEO country pages, one public brand Telegram channel posting 24h-old green jobs tagged with country hashtags (amended 2026-09-16: one channel instead of one per country; split out a country channel only once it has the volume). Soon after: "Landed a role?" share cards. Later: employer "hires globally" badge. |
| D28 | Timeline | Private beta in about 3 weeks, with passes live if a payment provider has approved Pemby by then (otherwise the beta opens free-only), public launch around week 7. Estimates, not promises. |
| D29 | Progress visibility | Staging site, a progress page (claude.ai artifact) updated after every work unit with screenshots, a daily summary, and owner checkpoints (section 8). |
| D30 | Founder story | The owner's own story (Moldovan engineer, 7 years, underpaid by middlemen) is used on the landing page and in launch posts, with their name. |

Reconciliation note: D13 gives free users 3 kits a month paid by Pemby, while D18 says kits need a
pass or the user's key. They agree: the 3 free kits count against the $3/day cap, and kits 4+ need
a pass or the user's own key.

## 3. Architecture

```
                 Cloudflare (DNS, Turnstile, email routing)
                                   |
   Railway ---------------------------------------------------------------
   | web (Next.js)          worker (Node)                bot (grammY)     |
   | - landing, legal, SEO  - ATS ingestion + freshness  - webhook        |
   | - CV drop, onboarding  - enrichment + eligibility   - account link   |
   | - Brief, tracker, kits - CV parsing                 - buttons, flags |
   | - billing webhooks     - matching + near misses                      |
   | - admin                - delivery dispatcher (TG, email, push)       |
   |                        - flag rules, GitHub issue digest             |
   |        \___________________ Postgres (Drizzle, pg-boss) ____/        |
   |                            Bucket (CV files)                         |
   ------------------------------------------------------------------------
        OpenRouter (public key / private ZDR key / user OAuth keys)
        Dodo or Paddle (checkout, tax, payouts)   Resend   Sentry   PostHog
```

Repository layout:

```
apps/web        Next.js app, marketing + product + admin + webhooks
apps/worker     queues: ingest, verify-live, enrich, parse-cv, match, deliver, flags, digests
apps/bot        Telegram webhook service
packages/db     Drizzle schema, migrations, seed (demo data for staging)
packages/core   eligibility tiers, gates, scoring, near-miss grouping, pass/entitlement logic
packages/ai     OpenRouter client, key routing, cost ledger, daily cap, prompt loading
packages/ats    connectors: Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Recruitee, Personio
packages/ui     shared design tokens and components produced through /impeccable
data/programs   programs calendar (YAML or JSON), edited by PR
eval/           eligibility accuracy check: labeled posts + scoring script
docs/           plan, research, phases, handoffs
```

Core data (names indicative, phase 01 finalizes):
- `users`, auth tables, `anonymous_sessions`
- `profiles`: citizenships, residence, timezone and overlap, own company, permits, English level, ways of working, employment types, titles, seniority, stack, dealbreakers, min rate and currency, hide-no-salary, company prefs, application defaults
- `cv_files`: bucket key, extracted text, parsed JSON, `expires_at` for anonymous uploads
- `companies`: domain, ATS type and board token, hiring-country evidence
- `jobs`: source, external id, URL, title, raw text, `first_seen_at`, `last_verified_live_at`, status
- `job_enrichment`: seniority, stack, salary, allowed ways of working, eligibility rules per country or region with evidence, model and prompt version
- `eligibility_evidence`: subject (job or company), country, verdict, source (post, careers page, EOR, user report, flag), weight
- `matches`: user, job, gate results, score, reasons, gap, state (new, saved, applied, passed + reason), per-channel `delivered_at`
- `applications`: tracker state, outcome, rejected-for-location
- `flags`: job, user, reason, note, status (auto-resolved, needs review, dismissed), action taken
- `kits`: user, job, content, model, cost
- `ai_usage`: user (nullable), task, model, key class (public, private, user), tokens, cost
- `passes`: user, starts, ends, source (purchase, referral, guarantee, share), paused_at
- `payments`: provider, provider ref, amount, status, refunds
- `referrals`, `channels` (Telegram chat, email, push subscriptions, quiet hours), `delivery_log`

## 4. Matching and delivery rules

1. The worker enriches each new job once. Eligibility is stored per country and per way of working, with evidence.
2. On a new enriched job, or a profile change, the matcher runs hard gates, then the score (embedding similarity, skill overlap, domain, timezone overlap, company fit). Weights are private config.
3. Score >= 80 creates a match with templated reasons ("TypeScript, Go match; 4h overlap; no Kubernetes on your CV").
4. The dispatcher sends pass holders' matches immediately and free users' matches 24h after the job was first seen, respecting quiet hours. Late messages carry the upgrade note.
5. Freshness: every open job is re-checked on its ATS board at least every 12 hours; a dead job is closed and pulled from Briefs.
6. Near misses: jobs that failed exactly one gate or scored 65–79 are grouped by blocker for the Brief.

## 5. Monetization mechanics

- Entitlements live in `packages/core/src/entitlements/`, created in phase 07, and are the only place that decides instant vs delayed, kit quota and yellow opt-in.
- Guarantee job: daily, extends any active pass with zero matches in the last 14 days, once per 14-day window.
- Referral rewards need the invitee to upload a CV that parses and to pass Turnstile.
- Refunds within the active provider's refund window from D14 revoke the pass.

## 6. Flag rules

| Flag | Automatic action |
|---|---|
| Closed or fake | Re-check the ATS board now. Gone: close the job for everyone and thank the flagger. |
| Doesn't hire from my country | 1 flag: queue re-verification of the post and a re-run of the phase 05 company evidence job for that company. 2+ independent flags: downgrade the tier for that country and record company evidence. |
| Scam | Quarantine immediately, hidden for everyone, until the owner reviews. |
| Wrong details | The user picks from a fixed picker with no free text: which field (salary, seniority, stack, location or eligibility) and a value from a fixed list. Re-run enrichment on the public key with only those fixed values as hints; if still disagreeing, send to review. |
| Duplicate | Merge. |

Anti-abuse: flags from pass holders and accurate past flaggers weigh more; daily flag limit per user.
Free text from an "Other" flag goes only to the owner review queue and never to any model.

## 7. Phases

Each phase is one fresh lead session. Start it in `/Users/stephen/Development/Pemby` and give it the
phase file path. Every phase follows `docs/phases/_COMMON.md` and ends with a handoff file in
`docs/phases/handoffs/`.

| Phase | File | Outcome | Depends on | Status |
|---|---|---|---|---|
| 00 | `docs/phases/00-founder-setup.md` | Accounts, keys, DNS, pre-clearance emails sent | none | **partial 2026-09-16** (OAuth, Sentry, PostHog deferred; payment emails pending) — `docs/phases/handoffs/00-handoff.md` |
| 01 | `docs/phases/01-foundation.md` | Monorepo, schema v1, auth, Railway prod + staging, CI, progress page | 00 (partial is fine) | **done 2026-09-16** (staging only; OAuth, magic link, Sentry, PostHog deferred) — `docs/phases/handoffs/01-handoff.md` |
| 02 | `docs/phases/02-product-context-and-landing-direction.md` | PRODUCT.md, landing direction round, approved landing comp | 01 (ran first; 00 and 01 still pending) | **done 2026-09-16** — `docs/phases/handoffs/02-handoff.md` |
| 03 | `docs/phases/03-landing-legal-pricing.md` | Landing, pricing, Terms, Privacy, Refund live on pemby.app; DESIGN.md | 02 | **done 2026-09-17** (live on pemby.app; legal drafts await a lawyer's read; payment applications moved to after 06) — `docs/phases/handoffs/03-handoff.md` |
| 04 | `docs/phases/04-job-ingestion.md` | ATS connectors, company seed list, freshness checks, dedupe | 01 | **done on staging 2026-09-16** (6 of 7 ATS: SmartRecruiters awaits permission; production ingestion running since 2026-09-17 via phase 05; 24h run still unproven) — `docs/phases/handoffs/04-handoff.md` |
| 05 | `docs/phases/05-ai-enrichment-eligibility.md` | AI layer, job enrichment, eligibility engine, eval check, model picks | 04 | **done on staging and production 2026-09-17** (production enrichment backfill waits for the owner; 24h worker stability unproven) — `docs/phases/handoffs/05-handoff.md` |
| 06 | `docs/phases/06-cv-drop-onboarding.md` | Anonymous CV drop, parsing, teaser, signup, 3-step onboarding | 03, 05 | **done on staging 2026-09-17** (production keeps the stand-in and closed sign-up; green-tier supply is a phase 07 decision) — `docs/phases/handoffs/06-handoff.md` |
| 07 | `docs/phases/07-matching-brief.md` | Matcher, near misses, Brief UI, juniors, programs calendar | 06 | **done on staging 2026-09-18** (owner checkpoint on a real CV still outstanding; CV parsing yields no domains, which keeps a third score component dark) — `docs/phases/handoffs/07-handoff.md` |
| 08 | `docs/phases/08-delivery.md` | Telegram bot, email, web push, dispatcher, quiet hours | 07 | **done on staging 2026-09-19** (account linking proven on the owner's real Telegram; **no match card has ever been delivered — staging has never held a `kind='match'` row**, and the constraint is eligible supply, not the threshold) — `docs/phases/handoffs/08-handoff.md` |
| 09 | `docs/phases/09-kits-tracker-flags-admin.md` | Application kits, OpenRouter OAuth, tracker, flags, admin | 08 | not started |
| 10 | `docs/phases/10-passes-payments-referrals.md` | Passes, billing adapter, guarantee, referrals | 09; going live needs a payment provider approval recorded in `docs/SETUP.md` | not started |
| 11 | `docs/phases/11-growth-surfaces-private-beta.md` | SEO pages, public channels, hardening, private beta opens | 10, or 09 if no provider has approved yet (free-only beta) | not started |
| 12 | `docs/phases/12-feedback-loop-share-cards.md` | GitHub issue digest + label-gated fix PRs, hired share cards | 11 | not started |
| 13 | `docs/phases/13-public-launch.md` | Polish and audit pass, security review, launch posts, public launch | 12 | not started |

Phases 02 and 04 touch different files and may run in two parallel sessions after 01 if the owner wants.

Payment timing: Dodo and Paddle domain reviews need the live site with pricing and legal pages, so
the owner submits applications right after phase 03 deploys.

## 8. Owner checkpoints

The session stops and waits for the owner at: landing direction and comp approval (02), landing build
and design system (03), onboarding flow (06), the Brief (07), Telegram message design (08), payments
going live (10), private beta opening (11), public launch (13). Every commit also needs the owner's
explicit approval.

## 9. Backlog after the MVP

Chrome form-filling extension (first after launch), scam-recruiter heuristics beyond the money-ask
block, "go direct" guide (IT Park invoicing, when to use Deel or Remote, with EOR affiliate links
kept well under 30% of revenue), Russian translation, company hiring-by-country pages, salary
estimates, employer "hires globally" badge, Redact PII masking before OpenRouter, designers and PMs.

## 10. Open risks

- Merchant-of-record rejection. Mitigation: pre-clearance emails, two applications, wording rules.
- IT Park classification. Mitigation: wording rules, declare CAEM 58.29 and 63.11, accountant review with the 12 questions in research 11.
- Free-model instability (75–93% uptime). Mitigation: paid fallbacks, daily cap.
- Eligibility accuracy. Mitigation: the eval check, flags, user outcome reports.
- Claude subscription token for the GitHub Action may not fit "ordinary individual usage". Mitigation: label-gated runs only; API key fallback.
- Items marked UNVERIFIED in research must be confirmed by the phase that relies on them.
- Recruitee's public API needs a per-employer token from 10 Feb 2027 (research 15). Mitigation: revisit in January 2027; 25 of 300 seed boards depend on it.
- SmartRecruiters is excluded until it grants written permission (its robots.txt allows only LinkedInBot). Mitigation: permission request; the connector is built and switched off.
