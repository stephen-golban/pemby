# Phase 08: delivery over Telegram, email and web push

Read `docs/phases/_COMMON.md` first.

## Read first

- `docs/PLAN.md` D8, D13, D16, D26, sections 4 and 6
- `docs/research/08-hirify-and-telegram.md` (all of it)
- `DESIGN.md`, `docs/phases/handoffs/07-handoff.md`

## Goal

Every match reaches the user the moment it is created (pass holders) or 24h after the job was first
seen (free users), on the channels they chose, with buttons that act in place.

## In scope

1. **Telegram bot** in `apps/bot` with grammY on webhooks and `secret_token` verification, running as an
   always-on Railway service. Confirm the current grammY version and Bot API features first.
   - Account linking by deep link `t.me/<bot>?start=<one-time token>` (64-char limit) generated from the web app.
   - Match message: title, company, tier with reason, verified-live time, top reasons and gap, salary when present.
   - Inline buttons: Apply (opens the job or, later, the kit), Save, Not for me (reason picker), Flag (reason picker, with the fixed Wrong details picker from PLAN section 6). Answer every callback query. Edit the message in place after an action ("Saved", "Applied").
   - Commands: `/start`, `/pause`, `/resume`, `/quiet`, `/help`, `/brief` (link to web).
   - No payments inside the bot (Telegram requires Stars for digital goods). The bot links to pemby.app for passes.
2. **Email** via Resend: one email per match by default, plus a digest option the user can choose.
   Unsubscribe, preference and flag links. Plain, well-designed template through /impeccable.
3. **Web push** for the installed PWA and desktop browsers (VAPID keys, service worker, subscription management).
4. **Dispatcher** in the worker: reads new matches, asks only `packages/core/src/entitlements/` for
   instant vs 24h delay, quiet hours in the user's timezone, per-chat rate limits (about 1 message per second per
   chat, about 30 per second overall), retries, `delivery_log`. Late messages for free users carry the
   D13 upgrade note with the real delay.
5. **Channel settings UI** in the web app: connect Telegram, email on or off, push on or off, quiet
   hours, pause. Optimistic.
6. **Flags from Telegram and email** write to `flags`, with the daily per-user flag limit applied from
   the moment they are stored; the automatic rules come in phase 09, so store them now.

## Design

Telegram message layout and the email template go through /impeccable (text-first Operate surfaces).
Show the owner three message layouts before building the final one.

## Suggested work orders

- A (opus): bot service, linking, message rendering, callbacks, commands. Owns `apps/bot/`.
- B (opus): dispatcher, entitlements check, quiet hours, rate limits, delivery log. Owns `apps/worker/src/deliver/`.
- C1 (opus): email template and sending, including the flag link. Owns `apps/web/src/emails/`, `apps/worker/src/email/` and the email flag route.
- C2 (opus): web push, service worker, channel settings UI. Owns `apps/web/src/app/settings/`, the service worker file and `apps/worker/src/push/`.

Adversarial review (fresh, blind): webhook verification, deep-link token handling, dispatcher double
sends and rate-limit behavior.

## Checkpoint with the owner

Message layout choice, then the owner receives real matches on their own Telegram from staging.

## Definition of done

- Owner's Telegram receives an instant match on staging within a stated number of seconds of match creation (report it); a free test account receives it after the delay (shorten the delay on staging to prove it).
- Buttons edit the message in place; flag and not-for-me write rows (show them).
- Quiet hours hold a message and release it after (proven on staging).
- Email and push both deliver a test match.
- Account export and deletion cover the tables this phase adds: channels, push subscriptions and `delivery_log`.
