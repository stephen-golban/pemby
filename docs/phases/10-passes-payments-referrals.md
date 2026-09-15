# Phase 10: passes, payments and referrals

Read `docs/phases/_COMMON.md` first. Money moves in this phase, so an adversarial review is required.

## Read first

- `docs/PLAN.md` D12–D16, D27, section 5
- `docs/research/06-payments-moldova.md`, `docs/research/14-mor-acceptable-use.md`
- `docs/SETUP.md` for which provider approved Pemby (Dodo, Paddle or both)
- `docs/phases/handoffs/09-handoff.md`

## Precondition

At least one of Dodo Payments or Paddle has approved the account. If neither has, build the
provider-neutral layer and the pass logic against the provider's sandbox, and stop before going live.
Tell the owner.

## Goal

Users buy 1, 3 or 6 month passes with a one-time payment, passes stack, and every entitlement in the
product follows the pass. Guarantee extensions, hired pauses, refunds and referral rewards all work.

## In scope

1. **Billing interface** in `packages/core` (create checkout, handle webhook event, refund, map
   provider product ids) with one adapter for the approved provider. Check that provider's current API,
   webhook signature verification and one-time product setup in its official docs first.
2. **Checkout flow** from the pricing page, the Brief upgrade prompts, late-delivery messages and the
   kit quota wall. Returns to the app with the pass visible immediately (optimistic, confirmed by webhook).
3. **Passes ledger.** Purchases stack on remaining time; expiry reminder 5 days before (Telegram and
   email); the no-match guarantee job; "Landed a role?" pause and resume; refunds within the active
   provider's refund window revoke the pass, with the window stored as a per-provider setting per D14:
   7 days on Dodo, 14 days on Paddle; idempotent webhook handling.
4. **Entitlements.** Fill in the real pass logic behind the `packages/core/src/entitlements/` interface
   from phase 07, the single source for instant delivery, kit quota and yellow opt-in. Keep the
   interface unchanged. Earlier phases call only this module, so there are no temporary checks to hunt for.
5. **Referrals.** Personal link, attribution cookie, rewards per D27 with Turnstile and parsed-CV
   conditions, referral status in the profile.
6. **Receipts and account page** showing passes, days left and history.
7. Set the pricing and Refund Policy pages to the active provider's refund window from D14.

## Suggested work orders

- A (opus): billing interface, provider adapter, webhooks. Owns `packages/core/src/billing/` and webhook routes.
- B (opus): passes ledger, guarantee, hired pause, reminders, entitlements logic. Owns `packages/core/src/passes/`, `packages/core/src/entitlements/` and the related worker jobs.
- C (opus): checkout UI touchpoints, account page and referrals, through /impeccable. Owns those routes.

Adversarial review (fresh, blind, required): webhook signature checks and replay, double crediting,
refund revocation, referral farming, entitlement bypass.

## Checkpoint with the owner

A real purchase of the $5 pass by the owner in production (then refunded), before passes are shown to
beta users.

## Definition of done

- Sandbox and one real production purchase create the right pass; a refund revokes it; a replayed webhook changes nothing (show evidence).
- Stacking, guarantee extension and hired pause verified on staging with shortened durations.
- Referral reward granted only after the invitee's CV parses.
- Account export and deletion cover the tables this phase adds: passes, referrals and payments. Payment records follow the retention rule stated in the Privacy Policy and are kept for accounting as required rather than deleted.
- Adversarial review findings resolved or accepted by the owner.
