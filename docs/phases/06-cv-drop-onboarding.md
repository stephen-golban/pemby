# Phase 06: CV drop, parsing, signup and onboarding

Read `docs/phases/_COMMON.md` first.

## Read first

- `docs/PLAN.md` D2–D5, D10, D11, D13, D16–D19, D22, D30
- `PRODUCT.md`, `DESIGN.md`, `docs/phases/handoffs/03-handoff.md` and `05-handoff.md`
- `docs/research/07-openrouter-integration.md` (PDF and privacy notes)
- `docs/research/12-juniors-and-internships.md` (product implications only)

## Goal

A visitor drops a CV on the landing page with no account, sees their parsed profile appear piece by
piece and a real teaser ("N roles hire from Moldova, here are 3"), signs up to save, and finishes the
three onboarding steps in about a minute. Everything feels instant.

## In scope

1. **Upload.** PDF and DOCX, size limit, Turnstile check, rate limit per IP and per anonymous session.
   File goes to the bucket; text extraction happens in our worker (a PDF text library plus a DOCX
   converter; scanned PDFs get a clear "we couldn't read this, paste your CV text" fallback). Never send
   files to OpenRouter plugins.
2. **Parsing.** Private key, ZDR, structured profile: name, titles, seniority, years, stack, domains,
   location, timezone guess, languages, links. Counts against the $3 cap; when the cap is hit the user
   sees an honest queued state.
3. **Streaming feel.** The parsed profile fills in progressively in the UI (streamed structured output
   or staged updates).
4. **Teaser.** Use the matcher's gates available so far (eligibility for the guessed country plus role
   and seniority) to count and show 3 real jobs. Phase 07 replaces this with the full matcher; keep the
   teaser behind an interface so the swap is small. The teaser counts green tier only and never shows
   yellow to anonymous or free users.
5. **Signup to save.** Better Auth claim of the anonymous session. Unclaimed CVs and data are deleted
   after 24h by a worker job.
6. **Onboarding cards.** Three steps from D5, pre-filled from the CV, one-tap accept, inline edit
   chips, live match counter updating optimistically through the same teaser interface as item 4,
   counting green tier only. Eligibility step is required; the others can be
   skipped. Juniors and interns get local plus programs ways of working on by default (D3, D11).
7. **Profile page.** Edit everything later, "profile strength" meter, export data, delete account.

## Design

Invoke /impeccable. This is an Operate surface inside the world DESIGN.md established. Flip the build
path toggle to code-first for this round (the owner chose code-first for app screens). Use `onboard`
guidance for first-run and empty states. Run the detector and the finish reviewer at the end.

## Suggested work orders

- A (opus): upload, Turnstile, rate limits, bucket, text extraction, 24h cleanup. Owns `apps/web/src/app/api/cv/` and `apps/worker/src/cv/`.
- B (opus): parsing schema, prompt (private config), streaming to the client. Owns `packages/core/src/profile/` and the parse job.
- C1 (opus): CV drop UI, streaming profile, teaser, signup claim, through /impeccable. Owns `apps/web/src/components/cv-drop/`, the shared profile components in `apps/web/src/components/profile/`, `apps/web/src/lib/teaser/` and the claim route. Starts once A and B publish their API contract.
- C2 (opus): onboarding cards with the live counter, profile page with export and delete, through /impeccable. Owns `apps/web/src/app/onboarding/` and `apps/web/src/app/profile/`. Starts after C1 publishes the shared components.

Adversarial review (fresh, blind): personal data handling end to end (bucket permissions, deletion,
logging of CV text, key class used, Turnstile bypass).

## Checkpoint with the owner

The full flow on staging with the owner's own CV and one junior CV the owner provides or approves.

## Definition of done

- Owner's CV: drop to teaser in under about 15 seconds on staging (report the timing), profile accurate enough that the owner accepts it.
- Signup claims the anonymous data; an unclaimed test upload is gone after the cleanup job runs (shorten the TTL on staging to prove it).
- No CV text appears in logs, Sentry or PostHog (show the check).
- Finish reviewer verdict recorded. Desktop and mobile screenshots on the progress page.
