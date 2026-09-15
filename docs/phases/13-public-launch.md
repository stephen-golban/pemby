# Phase 13: public launch

Read `docs/phases/_COMMON.md` first.

## Read first

- `docs/PLAN.md` all of it, especially D16, D27, D28, D30 and section 10
- `docs/research/04-business-and-gtm.md` (launch tactics)
- `PRODUCT.md`, `DESIGN.md`, `docs/phases/handoffs/12-handoff.md`, beta feedback and PostHog funnel numbers

## Goal

Pemby opens to everyone with the core claim proven in the beta, the surfaces polished, a security
review done, and launch posts ready for the owner to publish.

## In scope

1. **Beta review.** Summarize beta numbers from PostHog and the database: signups, onboarding completion,
   users with at least one match, Telegram link rate, kits, passes sold, eligibility flags and their
   outcomes, eval score trend. Decide with the owner what must change before launch. Fix only what
   blocks the launch.
2. **Design pass.** /impeccable `critique` and `audit` across landing, onboarding, Brief, kit, tracker
   and settings; `polish` on the findings the owner approves. Then the finish review on anything rebuilt.
3. **Security review.** Run the `security-review` skill over the codebase plus a fresh adversarial
   subagent on auth, payments, webhooks, user OpenRouter keys, file uploads, admin access and the GitHub
   workflow. Fix high and medium findings.
4. **Performance.** Landing and app Core Web Vitals on mobile (report numbers), worker queue latency
   from job seen to match delivered.
5. **Legal.** Remind the owner to get the lawyer read of Terms, Privacy and Refund (phase 03 drafts) and
   the accountant answers from research 11. Launch waits only if the owner says so.
6. **Open the gates.** Remove the beta allowlist, keep abuse limits, confirm the AI cap and alerts, and
   raise the cap with the owner if beta numbers justify it.
7. **Launch posts** for the owner to publish under their name, all run through the `unslop` skill and
   the D16 wording rules:
   - Show HN post and first comment (founder story, how eligibility works, what's open source, honest limits).
   - Reddit posts adapted per community rules (r/cscareerquestions, r/ExperiencedDevs, r/digitalnomad, r/remotework, Moldovan and Ukrainian tech communities). Check each subreddit's self-promotion rules first.
   - LinkedIn and X posts, and a Telegram announcement for the public channel.
   - A short launch changelog on the site.
8. **Launch day watch.** A checklist for the owner: dashboards to watch, how to raise the AI cap, how to pause ingestion, who to reply to first.

## Suggested work orders

- A (opus): beta numbers report. Owns `docs/launch/beta-report.md`.
- B (opus): /impeccable critique and audit, then polish per owner approval. Owns the surfaces it edits, one surface per order if the diff grows.
- C (opus): security review fixes. Owns the files named in findings; coordinate with B.
- D (opus): performance measurements and fixes. Owns the files it touches; coordinate with B and C.
- E (opus): launch posts and launch-day checklist. Owns `docs/launch/`.

## Checkpoint with the owner

Launch go or no-go, with the beta report, security verdict, and the posts ready.

## Definition of done

- Security findings high and medium fixed or explicitly accepted by the owner.
- Finish reviewer verdicts recorded for rebuilt surfaces.
- Allowlist removed on production; a brand-new visitor completes the whole flow.
- Launch posts in `docs/launch/`, approved by the owner.
- PLAN.md status table updated, backlog (PLAN section 9) confirmed as the next plan's starting point.
