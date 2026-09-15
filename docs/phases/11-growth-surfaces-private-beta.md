# Phase 11: growth surfaces and private beta

Read `docs/phases/_COMMON.md` first.

## Read first

- `docs/PLAN.md` D16, D27, D28, section 8
- `docs/research/04-business-and-gtm.md` (SEO and launch sections)
- `docs/research/08-hirify-and-telegram.md` (channels, broadcast limits)
- `docs/research/14-mor-acceptable-use.md`
- `docs/SETUP.md` for payment provider outcomes
- `DESIGN.md`, `docs/phases/handoffs/10-handoff.md`

## Goal

Pemby opens a private beta, with passes live if a payment provider has approved Pemby, while public SEO pages and a public Telegram channel start
bringing people in.

## In scope

1. **SEO country pages** such as `/remote/react/moldova`, framed as matching previews of what Pemby
   finds for that country and role group, not job listings for browsing. They show only green jobs that
   are at least 24h old, the same as the channel, so the free delay is kept. Each job shows a short
   summary plus a link to the company's own posting, not the full description. Because these pages are
   previews and not the job's own detail page, don't add JobPosting structured data; confirm this against
   Google's current job posting guidelines first. Use normal page metadata instead. Only pages with
   enough real jobs get indexed; thin pages are `noindex`. Sitemap updates.
2. **Public Telegram channel** per country (start with Moldova): the worker posts a small daily sample
   of green jobs that are at least 24h old, each linking to the bot for personal instant matches.
   Respect channel posting limits. Before shipping items 1 and 2, run a review of both surfaces
   against `docs/research/14-mor-acceptable-use.md`.
3. **Beta access.** Built on the phase 01 access gate: invite codes or an allowlist, with a waitlist
   state for the rest that still lets people drop a CV. A waitlist is fine only once the Dodo and Paddle
   domain reviews are finished. If a provider has approved Pemby and phase 10 is live, the beta opens
   with passes. If not, the beta opens free-only, passes stay hidden, and the lead tells the owner.
4. **Hardening.** Error states and empty states across flows (/impeccable `harden` on the app surfaces),
   rate limits on public endpoints, Sentry alerts to the owner, Postgres backups confirmed on Railway,
   a status check endpoint, and a pass through the privacy rules (logs, analytics, key classes).
5. **Analytics funnel** in PostHog: landing, CV dropped, profile parsed, signup, onboarding done, first
   match delivered, Telegram linked, kit generated, pass bought, referral sent. No personal data in events.
6. **Beta onboarding message** for invited users, and a feedback path (Telegram command or a form that
   writes to the admin page).

## Suggested work orders

- A (opus): SEO preview pages and their metadata. Owns the `/remote` routes.
- B (sonnet): public channel poster. Owns `apps/worker/src/channels/`.
- C (opus): beta access, waitlist state, feedback path. Owns access-control code and those routes.
- D1 (opus): /impeccable `harden` over the app routes. Owns `apps/web/src/app/{onboarding,brief,kit,tracker,settings}/`.
- D2 (opus): rate limits, Sentry alerts, backups, analytics funnel. Owns the middleware and instrumentation files. Adds funnel events inside D1's routes only after D1 lands.

Adversarial review (fresh, blind): indexing rules and the no-JobPosting decision, rate limits, privacy in analytics.

## Checkpoint with the owner

Go or no-go for opening the beta, with the progress page showing every flow working on production.

## Definition of done

- Three real country pages are live, indexable, and carry no JobPosting markup; the Google guideline check is recorded in the handoff.
- The Moldova channel posts a real sample.
- The research 14 review of the SEO pages and the channel found no problems, or they were fixed.
- An invited test user goes from landing to first delivered match on production.
- PostHog shows the funnel events from that run.
- The owner opens the beta and sends the first invites.
