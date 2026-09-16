# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Already decided by the owner in `docs/PLAN.md` (D20), not delegated to design work: TypeScript monorepo
(pnpm + Turborepo); Next.js App Router web app; TanStack Query mutations with rollback plus React
`useOptimistic` for optimistic UI everywhere; Postgres on Railway with Drizzle; pg-boss queues; Better
Auth (GitHub, Google, magic link, anonymous); Railway bucket for CV files; Resend email; grammY Telegram
bot on webhooks; Vercel AI SDK with `@openrouter/ai-sdk-provider`; Sentry and PostHog. Hosting is Railway
(services `web`, `worker`, `bot`) with Cloudflare DNS, Turnstile and Email Routing (D21).

## Users

Tech people in countries that "remote" jobs quietly exclude: Moldova first, then Ukraine, Georgia,
Armenia, the Balkans, LATAM, Africa and South Asia. Job seekers only; there are no employer accounts
(D1).

Roles: engineering (frontend, backend, full-stack, mobile, DevOps/SRE/platform, data, ML/AI, QA/SDET,
security) plus adjacent technical roles (data analysts and scientists, IT support and sysadmins,
solutions architects, engineering managers and tech leads, DevRel, technical writers). All seniorities,
intern to principal. Designers, PMs and scrum masters are out of scope for now (D10).

The situation: they read a "remote" posting that turns out to be US-only or EU-only, spend hours
applying into postings that are stale or already filled, and cannot tell from free text whether a
company can legally pay someone in their country at all. Juniors and interns have the same problem with
fewer options, so local (on-site or hybrid in their own country) and paid programs count as ways of
working for them (D3, D11).

The job they are doing: find work that can actually hire them, without reading a feed.

## Product Purpose

Pemby is AI job-matching software; the user applies themselves. Someone drops a CV, confirms a few
pre-filled cards, and Pemby sends only the jobs that can legally hire them from their country and fit
them, the moment those jobs appear, over Telegram, email or web push. There is no feed. When nothing
matches, Pemby says so and shows what is blocking the near misses. Applying is the user's own act,
helped by an application kit that takes about a minute to paste (D6, D7, D9).

Success: a person in an excluded country stops reading listings and still hears about the roles that
can hire them, and the owner earns revenue from one-time passes without ever claiming to have placed
anyone.

## Positioning

Three mechanisms a neighboring product could not truthfully copy today:

1. **Eligibility per country and per way of working, with the reason shown.** Tiers: green "hires from
   your country", yellow "likely", white "unclear", red "excluded"; every label carries its reason and
   its evidence. Free users see green only; pass holders can opt into yellow; red is never shown. No
   existing board models this, and none of the major ATS job-board APIs has a "countries we hire from"
   field (D2, research 01 §2, research 02).
2. **Verified live.** Every open job is re-checked on the company's own ATS board at least every 12
   hours, and a dead job is closed and pulled from Briefs, so ghost and stale postings drop out
   (research 01 top-7 item 1).
3. **Honest silence.** When nothing passes the gates, Pemby says so and groups the near misses by
   blocker with one-tap fixes, instead of filling the screen with an infinite feed (D7).

Ways of working are modeled explicitly: B2B contractor, employee via EOR, relocation with visa,
freelance, local, and paid programs (D3).

## Operating Context

- The product reaches people mostly outside the web app: a Telegram bot is the primary channel, with
  email and web push beside it, per-user quiet hours, instant for pass holders and 24h late for free
  users (D8, D13).
- Entry is anonymous: a CV drop with no account, parsed into a profile, followed by a teaser ("N roles
  hire from your country, here are 3"), then optional signup to save. Unclaimed anonymous CVs are
  deleted after 24 hours (D4).
- Onboarding is three steps of pre-filled cards with a live match counter: eligibility; ways of working;
  role and money (D5).
- Matches arrive as a Brief, not a feed: hard gates plus a score of at least 80/100, each match showing
  its top three reasons and one gap, with Apply / Save / Not for me (D6).
- Users flag jobs (closed or fake, doesn't hire from my country, scam, wrong details, duplicate, other)
  and worker rules act on flags automatically (D26).
- Money: one-time passes, no subscriptions and no auto-renew — $5 for 1 month, $10 for 3 months
  (highlighted), $18 for 6 months; renewals stack on remaining time (D12). Free tier: CV parse,
  onboarding, Brief with near misses, all matches delivered 24h late on every channel, 3 application
  kits per month. Pass: instant delivery, unlimited kits, yellow matches opt-in, the Chrome extension
  when it ships (D13). Trust mechanics: zero matches in any 14-day stretch of an active pass adds 14
  days automatically; "Landed a role?" pauses the pass; the published refund window is 14 days until a
  provider is chosen (D14).
- The operator is the owner's Moldova IT Park SRL (Syncra Studio, www.syncra.studio); payments run
  through a merchant of record (Dodo or Paddle, whichever approves first) (D15).
- The repo is public under AGPL-3.0 and the product is built in public; prompts, scoring weights, source
  lists and keys stay out of it (D23).

## Capabilities and Constraints

**Confirmed capabilities:** CV drop and parsing; eligibility tiering with evidence; live re-verification
of job postings; rules-plus-embeddings matching with templated reasons; near-miss grouping; Telegram,
email and web push delivery with quiet hours; application kits (tailored CV bullets, cover letter,
screening answers to copy); an application tracker; flags; one-time passes, referrals and the no-match
guarantee.

**Explicitly not in the product:** no employer accounts; no feed; no server-side auto-apply and no
LinkedIn automation — a Chrome extension that fills forms in the user's own browser, where the user
clicks submit, is the phase-2 plan (D9). Boards that forbid scraping are never touched; rabota.md and
DOU only with written permission (D11).

**Terminology, binding on every user-facing string, email, bot message, metadata and post (D16):**
Pemby is "AI job-matching software; you apply yourself". Never use: job board, recruiter, recruitment,
placement, get hired, guaranteed job, auto-apply, scrape, beat the ATS, "we write your CV". The product
never claims or implies it got someone a job; user-reported outcomes are phrased as the user's own news.
The reasons are legal, not stylistic: merchant-of-record acceptable-use policies (research 14) and IT
Park eligibility, where placement (CAEM 78.10) is not an eligible activity (research 11).

**Privacy, binding:** anything containing personal data (CVs, profiles, kits, CV embeddings) uses the
private OpenRouter key with zero data retention; the public key only ever sees public job posts. CV text
is extracted by Pemby, never by sending files to third-party PDF plugins. The same per-request ZDR
applies when a user's own OpenRouter key is used (D17).

**Language:** English at launch, built i18n-ready with every user-facing string going through the i18n
layer. Russian is the first added language (D22).

**Cost constraint:** a hard cap of $3/day of Pemby AI spend; when hit, work queues and the owner is
alerted (D18).

**Undecided product facts:** which payment provider (Dodo or Paddle) will be live, and therefore the
provider-specific refund window behind the published 14 days (D14, D15); final model picks, pending the
eligibility accuracy check (D19); whether any local Moldovan board grants written permission (D11).

## Brand Commitments

- Name: Pemby. Domain: pemby.app.
- **desertant.com is a binding visual reference**, described in `docs/research/05-design-reference-desertant.md`
  with screenshots in `docs/research/desertant/`. It wins over generated direction where they conflict.
  What the owner values there: a warm off-white paper canvas with near-black ink and no pure white or
  pure black; a tight heavy grotesk against mono micro-labels; muted earthy accents rather than
  saturation; texture instead of gradients; physical, playful objects; evidence-first copy with
  footnoted methodology and admitted weaknesses.
- Voice: short, declarative, concrete. Sentence case. Numbers do the persuading, and caveats are stated
  rather than hidden. No hype adjectives, no exclamation marks.
- **Founder story, with the owner's consent (D30):** the landing page and launch posts may say that
  Pemby is built by **Stephen Golban**, a Moldovan software engineer with **7 years of experience**, who
  was **underpaid by middlemen**, and that the operator is his Moldova IT Park company, **Syncra
  Studio**. No figures, employers or events beyond these unless the owner supplies them.
- **Never Higgsfield.** Image generation runs through Codex CLI.
- Design work happens only through the `impeccable` skill (D25).

## Evidence on Hand

- **Real:** the desertant reference and its screenshots; the research corpus in `docs/research/` with
  primary sources; the prices in D12; the founder facts listed above.
- **Absent, and never to be invented:** there are no users, no testimonials, no case studies, no
  traffic or revenue metrics, no logos of companies using Pemby, no ratings, no press, no "trusted by"
  anything. Nothing is built yet.
- Demonstration material (an example match message, an example honest-silence state, an example job)
  is authored at full fidelity and **labeled synthetic wherever a visitor could mistake it for real**.
  Claims stay uninventable: no counts of jobs, companies or users, no benchmarks, no endpoints, no
  capability the product does not have.

## Product Principles

1. **Show the reason, not just the verdict.** Every eligibility label, match and rejection carries why.
2. **Silence is a feature.** Nothing to send is said plainly, with the blockers named; a feed is never
   the fallback.
3. **The user applies.** Pemby prepares and delivers; the act of applying, and the credit for landing a
   role, stay with the person.
4. **Evidence over adjectives.** Specific, footnoted, dated, with weaknesses admitted — the trust lever a
   job product needs.
5. **Nothing invented.** With no users or metrics, every demonstration is labeled and every claim is one
   the product can already keep.

## Accessibility & Inclusion

WCAG 2.2 AA is the committed bar: contrast for body-critical text (including muted sub-text and small
mono footnotes, which the desertant reference does not always clear), full keyboard operation, visible
focus rings, and `prefers-reduced-motion` honored by zeroing motion. The audience reads English as a
second language, so copy stays plain and every string is i18n-ready. Both light and dark are shipped,
honoring `prefers-color-scheme`.
