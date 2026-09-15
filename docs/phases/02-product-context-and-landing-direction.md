# Phase 02: product context and landing direction

Read `docs/phases/_COMMON.md` first.

## Read first

- `docs/PLAN.md` (all of section 1 and 2; this phase turns them into PRODUCT.md)
- `docs/research/05-design-reference-desertant.md` and the screenshots in `docs/research/desertant/`
- `docs/research/01-job-seeker-pain-points.md` (top 7 section only), `docs/research/04-business-and-gtm.md` (GTM section only)
- `docs/phases/handoffs/01-handoff.md`

## Goal

Capture product truth in `PRODUCT.md` through /impeccable `init`, then run /impeccable's new-work
direction round for the landing page and get the owner to approve one landing comp. No page code in
this phase.

## Steps

1. Invoke the `impeccable` skill and run its setup (`impeccable context`).
2. Run `init`. Most interview answers already exist in PLAN.md, so ask the owner only to confirm
   inferences and fill real gaps. Record in PRODUCT.md:
   - Platform `web`. Stack: the PLAN D20 stack, marked as already decided.
   - Users, purpose, positioning (eligibility per country with reasons, verified-live jobs, honest silence, no feed).
   - Constraints: wording rules D16, privacy rules, English with i18n.
   - Brand commitments: desertant.com is a binding visual reference; the founder story may be used with the owner's name; never Higgsfield.
   - Evidence on hand: no testimonials, users or metrics exist yet. Nothing may be invented.
   - Build path: record `"buildPath": "comp"` for the landing page in `.impeccable/config.json` as the owner
     already chose (comp-first for landing, code-first for app screens; the app phases flip the toggle to code).
3. Image generation runs through Codex CLI (see `_COMMON.md` for the exact command). Treat it as the
   harness image tool for /impeccable's comp steps, and embed prompts into every image with
   `impeccable embed-prompt`.
4. Run new-work for the landing page surface in Persuade mode. The desertant reference is pinned by the
   brief, so it wins over the roll where they conflict, as /impeccable's rules say. The landing page must:
   - Make the offer clear in one line: jobs that can actually hire you from your country, sent the moment they appear.
   - Put the CV drop in or right under the first viewport as the primary action (anonymous, no signup).
   - Show a synthetic, clearly labeled example of a match message with its eligibility reason, and an honest-silence example.
   - Carry the founder story section, the free vs Pass comparison with the real prices from D12, and a Telegram mention.
   - Link to pricing, Terms, Privacy and Refund pages (built in phase 03).
5. Present the direction on /impeccable's decision page, generate comps, and get the owner's approval.
   Then run visualize's three-comp round if the flow requires it and record the approved comp.
6. Write the surface brief with the direction contract, as /impeccable requires.

## Checkpoint with the owner

Direction choice and approved landing comp. Nothing continues to phase 03 without it.

## Definition of done

- `PRODUCT.md` exists at the repo root with the impeccable product-schema comment.
- `.impeccable/config.json` records the build path.
- Approved comp under `.impeccable/mocks/` with `"approved": true` in its sidecar.
- Surface brief with all six direction-contract blocks and the seed key.
- Progress page shows the approved comp. Handoff written.
