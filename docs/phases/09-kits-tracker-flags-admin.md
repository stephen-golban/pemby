# Phase 09: application kits, tracker, flags and admin

Read `docs/phases/_COMMON.md` first.

## Read first

- `docs/PLAN.md` D9, D13, D14, D17, D18, D26, sections 5 and 6
- `docs/research/07-openrouter-integration.md` (OAuth PKCE, key checks, 402 handling)
- `docs/research/03-competitors-and-automation.md` (legal section on application help)
- `DESIGN.md`, `docs/phases/handoffs/08-handoff.md`

## Goal

A user can open a match and get a tailored application kit in seconds, track where each application
stands, and flag bad jobs that Pemby then handles automatically. The owner has a small admin page to
see flags, AI spend and source health.

## In scope

1. **Application kit.** For a (user, job): tailored CV bullets, a short cover letter, answers to common
   screening questions (and to questions extracted from the job post when present). Uses the private
   key with ZDR and `anthropic/claude-haiku-4.5` (or phase 05 routing). Copy buttons per section.
   Streams into the UI. Stored in `kits`. Application defaults (notice period, links, work authorization
   answers) are asked in context the first time they are needed (D5).
2. **Kit entitlement.** The quota comes only from `packages/core/src/entitlements/`: 3 free kits per month paid by Pemby (count against the cap), unlimited for pass
   holders, and beyond that either a pass or the user's own OpenRouter account.
3. **Connect OpenRouter** by OAuth PKCE: store the returned key encrypted at rest, check it with the key
   endpoint, fall back or prompt on 402. Disconnect removes it (and tells the user to revoke it in
   OpenRouter, because Pemby can't). Kit calls on a user's own key send
   `provider: { zdr: true, data_collection: "deny" }` on every request.
4. **Tracker.** Saved, Applied, Interview, Offer, Rejected, with "rejected because of my location?" on
   Rejected that writes eligibility evidence. Applying from a kit moves the match to Applied
   optimistically. Telegram and web stay in sync.
5. **Flag rules** from PLAN section 6 as worker jobs, with anti-abuse weighting and a daily flag limit.
   They also process flags stored before the rules existed. A Wrong details flag carries only the
   fixed field and value from its picker, with no free text, and only those fixed values go to
   re-enrichment as hints, on the public key. Free text from Other goes only to the owner review queue
   and never to any model.
6. **Admin page** (owner-only): flags needing review with approve or dismiss, quarantined jobs, AI spend
   today vs the cap and by task, source health from phase 04, delivery failures. Plain and functional.

## Design

Kit view and tracker through /impeccable, code-first, Operate. The admin page stays minimal and does
not need the finish review.

## Suggested work orders

- A (opus): kit generation, prompts (private config), entitlement, context questions, kit UI. Owns `apps/worker/src/kits/` or the kit route handlers, and the kit UI route.
- B (opus): OpenRouter OAuth connect and user-key routing in `packages/ai`. Owns the connect routes and user key storage.
- C (opus): tracker model, UI and sync with Telegram. Owns tracker routes and `packages/core/src/tracker/`.
- D1 (opus): flag rules worker jobs, including the backlog of stored flags. Owns `apps/worker/src/flags/`.
- D2 (opus): admin page. Owns `apps/web/src/app/admin/`.

Adversarial review (fresh, blind): user key encryption and handling, owner-only admin access, flag
abuse paths (mass-flagging a real job).

## Checkpoint with the owner

The owner applies to one real job using a kit from staging and judges the kit quality.

## Definition of done

- Kit for the owner's profile generates within a stated time and the owner accepts its quality.
- Free quota blocks the 4th kit with the Pass or connect-OpenRouter choice; a connected test key generates a kit and its cost lands in `ai_usage` under the user key class.
- A scam flag quarantines a job for everyone; a closed flag on a removed job closes it (show both).
- Admin page shows today's AI spend and source health.
- Account export and deletion cover the tables this phase adds: kits, applications and stored user keys.
