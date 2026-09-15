# Phase 03: landing, pricing and legal pages

Read `docs/phases/_COMMON.md` first.

## Read first

- `docs/phases/handoffs/02-handoff.md`, `PRODUCT.md`, the landing surface brief and approved comp
- `docs/PLAN.md` D12–D16, D30
- `docs/research/14-mor-acceptable-use.md` (website requirements and wording to avoid)
- `docs/research/11-it-park-eligibility.md` (wording risk section only)

## Goal

pemby.app in production serves the landing page built from the approved comp, a pricing page, and
Terms, Privacy and Refund pages that satisfy Dodo's and Paddle's domain reviews. After this phase the
owner can submit both payment applications. /impeccable's finish review passes and DESIGN.md is written.

## In scope

1. **Landing page** built comp-led with /impeccable (build-phase state machine, plates, hero gate,
   sections, motion, responsive). The CV drop can be a visual stand-in that links to a "coming soon"
   state until phase 06 wires it, but it must not look broken or behave like a waitlist (reviewers
   reject login walls and waitlists).
2. **Shared design system.** Tokens and base components land in `packages/ui` so app phases inherit them.
3. **Pricing page.** Free vs Pass, the three passes, "one-time payment, no auto-renew", 14-day refunds until a payment provider is approved per D14,
   the no-match guarantee, and a note that Pemby does not place candidates.
4. **Legal pages.** Terms of Service, Privacy Policy and Refund Policy naming the owner's SRL (details
   from the owner or `docs/SETUP.md`). Draft them from PLAN decisions: CV processing and retention,
   anonymous uploads deleted after 24h, OpenRouter as a subprocessor with zero data retention for
   personal data, the user's own OpenRouter connection, Telegram, email and push channels, passes and
   refunds with a 14-day Refund Policy window until a payment provider is approved per D14, account
   export and deletion, a retention rule for payment records kept for accounting, flags, acceptable use. Mark the pages as reviewed by nobody
   yet in the handoff; the owner should get a lawyer's read before public launch. Footer links to all
   three, plus `hello@pemby.app`.
5. **SEO basics.** Metadata, Open Graph image (generated through the comp pipeline or composed in
   code), sitemap, robots.txt.
6. **Finish.** /impeccable detector, finish reviewer, fixes, then the documenter writes DESIGN.md and
   `.impeccable/design.json`.

## Suggested work orders

- A (opus): landing page, comp-led, owns the landing route and `packages/ui`. Use /impeccable's
  `impeccable-asset-producer` for plates. The lead keeps the comp-diff gates.
- B (opus): pricing page and legal pages, owns those routes and their content files. Legal copy runs
  through the `unslop` skill and the D16 wording rules. Starts after A has shipped the tokens.
- C (sonnet): SEO basics, owns metadata, sitemap and robots files.

Run an adversarial wording review over all public copy (fresh subagent): check D16 and the
acceptable-use risks in research 14.

## Checkpoint with the owner

The built landing on staging, then the finish review verdict, then promotion to production.

## Definition of done

- Production pemby.app serves the landing, `/pricing`, `/terms`, `/privacy`, `/refunds` with no login wall.
- Finish reviewer disposition is ship, or the owner accepted the open items in writing.
- DESIGN.md and `.impeccable/design.json` exist.
- Wording review found no D16 violations (or they were fixed).
- Desktop 1440 and mobile 390 screenshots on the progress page.
- Handoff tells the owner to submit the Dodo and Paddle applications now, and to record each outcome and its date in `docs/SETUP.md` when it arrives.
