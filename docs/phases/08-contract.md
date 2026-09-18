# Phase 08 work-order contract

Written 2026-09-18. Read with `docs/phases/08-delivery.md` and `docs/phases/_COMMON.md`.
This file is the single source of truth for the workers: what already exists, who owns which paths,
and the interfaces the parallel orders code against. Workers cannot see the lead's conversation.

Worktree: **`/Users/stephen/Development/Pemby-08`** (branch `phase-08`, off `origin/main` 673da3a — the phase 07 tip),
linked to Railway **staging only**. All paths below are relative to that worktree. Baselines on a
clean tree: `pnpm typecheck`, `pnpm lint`, `pnpm build` all exit 0.

## Corrections to the phase file and the 07 handoff

Verified first-hand on 2026-09-18. Do not repeat the originals.

1. **`apps/web/src/` does not exist.** Routes are `apps/web/app/**`, libraries `apps/web/lib/**`,
   components `apps/web/components/**`. The phase file's `apps/web/src/emails/` and
   `apps/web/src/app/settings/` are wrong, as they were in phases 06 and 07.
2. **The "compared programmatically" reason-parity check does not exist.** The 07 handoff says the
   English in `@pemby/core` and `apps/web/messages/en/brief.json` "are compared programmatically".
   No such script exists; CI runs only typecheck, lint and build. The strings *are* in fact
   identical today — measured by importing the real tables and diffing: 34/34 `GATE_REASONS`,
   13/13 `SCORE_REASONS`, zero drift — but nothing enforces it. **Order 1 writes the checker.**
   This matters more now than in 07: Telegram and email render from core's table while the web
   renders from the JSON, so drift would make one match read two different ways.
3. **Resend already exists, twice, as raw `fetch`** — `apps/web/lib/email/resend.ts` (`sendEmail`,
   10 s timeout, never logs recipients or bodies) and `packages/ai/src/alert.ts`. Do **not** add the
   `resend` npm SDK and do not write a third client.
4. **`RESEND_API_KEY`, `EMAIL_FROM`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`,
   `TELEGRAM_PUBLIC_CHANNEL`, `OWNER_TELEGRAM_CHAT_ID` are already in `.env.example`.** No VAPID
   variables exist yet.
5. **CORRECTED 2026-09-18 — the "second drizzle copy" is no longer true, and the real constraint is
   narrower.** The repo carries **exactly one** `drizzle-orm` in the store (`0.45.2`), verified by
   listing `node_modules/.pnpm`. What is true is that **`apps/web` does not declare `drizzle-orm` as
   a dependency**, so it cannot *write* a query — `import { eq } from "drizzle-orm"` fails — but it
   **can call** a `packages/db` helper that takes a `Db`, and that typechecks today. Order C2
   compiled it rather than believing the contract.
   The consequence: anything whose correctness depends on **one** implementation — the Telegram
   link-token codec, the delivery pause — should go through the kernel helper from web as well as
   from the worker. Ordinary per-surface reads stay raw SQL on `getDb().$client`, matching every
   existing `_lib/db.ts`. The stale claim originates in the header of
   `apps/web/app/api/brief/_lib/db.ts`, which should be corrected when someone next owns that file.
6. **`/sw.js` is blocked on staging.** `apps/web/lib/access/paths.ts:15` allowlists
   `/manifest.webmanifest` past the staging basic-auth gate but not the service worker path. Push
   will silently fail on staging until that is fixed.
7. **Account export does not cover `channels`.** `loadExport` (`apps/web/app/api/profile/_lib/db.ts:347`)
   covers `profiles`, `cv_files` and `user` only. Deletion *is* already covered — `channels` and
   `delivery_log` both declare `onDelete: "cascade"` from `user.id`
   (`packages/db/src/schema/delivery.ts:27,52`).
8. **There is no `/settings` route.** The channel-settings surface is greenfield.

## What already exists — do not rebuild any of it

| Thing | Where | State |
|---|---|---|
| `channels` | `packages/db/src/schema/delivery.ts:21` | `type`, `address`, `push_keys {p256dh,auth}`, `enabled`, `verified_at`, `quiet_start_minute`, `quiet_end_minute`, `timezone`. Unique `(type, address)`. |
| `delivery_log` | `delivery.ts:47` | `match_id`, `channel_id`, `channel_type`, `kind`, `status`, `late`, `provider_message_id`, `error`. Partial unique `(match_id, channel_type) where status='sent' and match_id is not null`. **This is the double-send backstop. Do not invent another.** |
| Per-channel marks | `matching.ts` | `matches.telegram_delivered_at`, `.email_delivered_at`, `.push_delivered_at`, and `matches.deliver_after` (already populated by the matcher). |
| Entitlements | `packages/core/src/entitlements/index.ts` | `entitlementsFor`, `deliverAfter`, `isPassActive`, `FREE_DELIVERY_DELAY_HOURS`. Pure, no DB, explicit `now`. **The only module that decides instant vs delayed.** |
| Reason renderers | `packages/core/src/gates/reasons.ts:85`, `scoring/reasons.ts:47` | `renderGateReason(key, params)`, `renderScoreReason(key, params)`. Naive `{param}` substitution, 120-char cap, no ICU, no plurals. |
| `flags` | `packages/db/src/schema/flags.ts:27` | Complete: `reason`, `country`, `field`, `field_value`, `note`, `weight`, `status`, `action_taken`. Unique `(job_id, user_id, reason)` where user not null. |
| `rate_limits` | `packages/db/src/schema/profiles.ts:209` | Fixed-window counters `(key, window_start) -> count`. **Reuse for the daily flag limit.** |
| Bot service | `apps/bot/src/index.ts` | 87-line `node:http` server: `GET /health`, `POST /telegram/webhook` with a constant-time secret check, private config loaded at boot. No grammY. |
| Worker module shape | `apps/worker/src/match/index.ts:1-7` | Four names: `readXEnv()`, `createXQueues(boss)`, `startXWorkers({boss, db, env})`, `scheduleXSweep(boss, env)`. |
| Sanitized errors | `apps/worker/src/cv/workers.ts:16` | `safeErrorLabel(error)` → constructor name + SQLSTATE only, never the message. Thrown as well as logged, because pg-boss persists the thrown value into `pgboss.job.output`. |
| Optimistic helper | `apps/web/lib/optimistic.ts:12` | `optimisticUpdate(queryKey, apply)`. Best exemplar: `apps/web/app/brief/_shared/use-brief.ts`. |
| Editor primitives | `apps/web/app/profile/_shared/fields.tsx` | `Ledger`, `FieldRow`, `ChoiceEditor`, `YesNoEditor`, `TimezoneEditor`, `NumberEditor`, … plus `panels.module.css`. `components/brief/ShownSettings` is the nearest toggle-group model. |

## Verified library facts (2026-09-18, primary sources)

Pin these exact versions. Do not take a version from memory.

| Package | Version | Note |
|---|---|---|
| `grammy` | **1.46.0** (2026-08-26) | Covers Bot API 10.3. Ships a built-in **`"http"`** adapter — confirmed by unpacking the published tarball: `adapters` keys include `http` and `https`. |
| `@grammyjs/auto-retry` | **2.0.2** | `bot.api.config.use(autoRetry())`. Honours `retry_after` on 429. Defaults: unlimited attempts/delay. |
| `@grammyjs/transformer-throttler` | 1.2.1 | **Do not use.** grammY's own flood docs open with "Consider using the auto-retry plugin instead" and warn it does not account for undocumented limits. |
| `web-push` | **3.6.7** | Last npm release 2024-01-16, but the repo is alive (commits to 2026-09-11). No verified maintained alternative exists; do not substitute one. |
| `resend` (SDK) | — | **Not used.** See correction 3. |

Telegram Bot API (current: **10.3, 2026-08-24**):
- `secret_token`: 1–256 chars, `A-Z a-z 0-9 _ -`, header `X-Telegram-Bot-Api-Secret-Token`.
- `callback_data`: **1–64 bytes**. Message text: **1–4096 characters after entity parsing**.
- HTML tags allowed: `b strong i em u ins s strike del span.tg-spoiler tg-spoiler a tg-emoji tg-time
  code pre blockquote blockquote-expandable`. Escape only `<`, `>`, `&`. **Use HTML, never
  MarkdownV2** — a title like `C#/.NET Dev (Remote!)` breaks unescaped MarkdownV2.
- Rate limits: ~1 msg/s per chat, ~30/s bulk. Paid broadcast is out of reach and unnecessary.
- `editMessageText` has **no** time limit on the bot's own ordinary messages. The 48-hour clause
  applies only to *business* messages not sent by the bot. `deleteMessage` *is* capped at 48 h.
- **`allowed_updates` trap, two parts.** The default (unset or empty list) excludes `chat_member`,
  `message_reaction`, `message_reaction_count` — but **not** `my_chat_member`, so block detection
  works by default. However: *"If not specified, the previous setting will be used."* Omitting the
  parameter on a later `setWebhook` does not reset it. **Always pass `allowed_updates` explicitly**,
  as `["message", "callback_query", "my_chat_member"]`.
- Blocked user → a `my_chat_member` update. Mark the channel dead then.
- `answerCallbackQuery` is mandatory on every callback, even with no toast, or the client spins.

Resend: `List-Unsubscribe` goes through the generic `headers` field — there is **no dedicated API
field**. RFC 8058 needs both `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`,
with the POST endpoint returning a blank 200/202. Team rate limit 10 req/s. Bounce/complaint webhook
events are `email.bounced` and `email.complained` (phase 09 territory; do not build them now).

Web push: iOS Safari 16.4+ supports the Push API **only for web apps saved to the Home Screen**
(MDN browser-compat `PushManager.safari_ios`). Say so in the settings UI rather than letting an
iPhone user enable a channel that silently never fires.

Timezones: **`Temporal` is not available in Node 24 without `--harmony-temporal`** — verified
locally on v24.18.0 (`typeof Temporal === "undefined"`). It lands by default in Node 26. Use
`Intl.DateTimeFormat` with `hourCycle: "h23"` and read `formatToParts()`, never a parsed formatted
string. Node ships full-icu, so every IANA zone resolves. **No date library is to be added.**

## Raw SQL traps (apps/web, and any raw query in the worker)

Canonical examples in `packages/db/src/queries/matching.ts`:
1. A bare array in an `sql` template expands to `($1,$2)`, not an array — use `sql.param` (helpers at :63-68).
2. node-postgres cannot parse a custom enum array on read — select `::text[]` (:269-270). Enum-array
   *parameters* cast to the enum type instead (`::way_of_working[]`, :1009).
3. `db.execute` returns timestamps as strings — select epoch milliseconds and rebuild the `Date`
   (`epochMs` helper, :77-78).
4. A `case` whose branches are both untyped bound parameters resolves to `text` — cast `::int`
   (:440-449, :1017).

## Ownership map

No two concurrent orders write the same file.

| Order | Owns | Must not touch |
|---|---|---|
| **1 — db + delivery kernel** (wave 1) | `packages/db/src/schema/**`, `packages/db/drizzle/**`, `packages/db/src/queries/delivery.ts`, `packages/db/src/index.ts`, `packages/core/src/delivery/*.ts` (files, not subdirs), `packages/core/src/index.ts`, `packages/core/scripts/check-reasons.ts`, `packages/core/package.json`, `.github/workflows/ci.yml` | `packages/core/src/delivery/email/**` (order C1), `apps/**` |
| **A — Telegram bot** (wave 2) | `apps/bot/**` | everything else |
| **B — dispatcher + all three senders** (wave 2) | `apps/worker/src/deliver/**`, `apps/worker/src/index.ts`, `apps/worker/package.json`, `.env.example` | other `apps/worker/src/*` modules |
| **C1 — email template + email-side routes** (wave 2) | `packages/core/src/delivery/email/**`, `apps/web/app/api/unsubscribe/**`, `apps/web/app/api/flag-from-email/**` | `packages/core/src/delivery/*.ts`, `apps/web/global.d.ts` |
| **C2 — push, settings UI, Telegram connect, export** (wave 2) | `apps/web/app/settings/**`, `apps/web/app/api/channels/**`, `apps/web/components/settings/**`, `apps/web/public/sw.js`, `apps/web/public/manifest.webmanifest`, `apps/web/lib/access/paths.ts`, `apps/web/global.d.ts`, `apps/web/messages/en/settings.json`, `apps/web/app/api/profile/_lib/db.ts` (export only), `apps/web/app/layout.tsx` (manifest link only) | `packages/**`, `apps/worker/**`, `apps/bot/**` |

Wave 1 runs alone because A, B, C1 and C2 all typecheck against order 1's exports.

## Cross-order interfaces

Order 1 publishes these from `@pemby/core` and every other order codes against them without reading
order 1's internals. Order 1 also pre-creates `packages/core/src/delivery/email/index.ts` as a typed
stub that throws, exported from core's index, so C1 fills a slot that already typechecks.

```ts
// packages/core/src/delivery/card.ts — channel-agnostic, pure, no DB types, no React.
export interface MatchCard {
  matchId: string; jobId: string;
  title: string; company: string;
  url: string;                       // apply_url ?? url
  tier: EligibilityTier;             // green | yellow only (D2 as amended)
  tierReason: string;                // already rendered by renderGateReason
  reasons: string[];                 // already rendered by renderScoreReason, max 3
  gap: string | null;                // already rendered
  salary: string | null;
  verifiedLiveAt: Date;
  late: boolean;                     // free-tier 24h message → carries the D13 upgrade note
  delayHours: number;                // the REAL delay, measured, not the constant
}
export function renderTelegramHtml(card: MatchCard, now: Date): string;   // <= 4096 chars, escapes < > &
export function renderPlainText(card: MatchCard, now: Date): string;      // email text part + push body
export function buildKeyboard(card: MatchCard): KeyboardRow[];            // button kind + payload, not Telegram types

// packages/core/src/delivery/callback.ts — shared by the bot (decode) and the dispatcher (encode).
export function encodeCallbackData(action: CallbackAction, matchId: string): string; // <= 64 BYTES, throws otherwise
export function decodeCallbackData(data: string): { action: CallbackAction; matchId: string } | null;

// packages/core/src/delivery/quiet.ts — pure, explicit clock, Intl only.
export function isWithinQuietHours(c: QuietWindow, at: Date): boolean;
export function nextReleaseAt(c: QuietWindow, at: Date): Date;   // start of the next open period

// packages/core/src/delivery/email/index.ts — order C1 fills this.
export function renderMatchEmail(card: MatchCard, ctx: EmailContext): { subject: string; html: string; text: string };
```

**Copy lives in core, not next-intl.** The worker and the bot cannot use React or `next-intl`, and
`apps/web` cannot import `apps/worker`. Delivery copy is therefore a typed key→string table at
`packages/core/src/delivery/strings/en.ts`, in the same shape as `GATE_REASONS`. Any key that also
appears in a web messages file is covered by the new parity checker. English only; the table shape
is what keeps it i18n-ready (PLAN D22).

## Staging reality, measured 2026-09-18 (read-only probe)

Before you assume an empty table, read this.

- **`channels` and `delivery_log` are NOT empty.** They hold 3 rows each, all **demo seed data** from
  `packages/db/src/seed.ts:1270` and `:1301` — fictional users `demo_user_ana`, `demo_user_ion`,
  `demo_user_nino`, with addresses `demo-chat-ana`, `ion.demo@example.com`, `nino.demo@example.com`.
- **The dispatcher must never send to a demo channel.** `jobs` and `companies` carry an `is_demo`
  flag; `channels` does not. `demo-chat-ana` is not a valid Telegram chat id, and the two
  `@example.com` addresses are real sends to bogus mailboxes that would bounce against our Resend
  domain reputation. Excluding demo users is a **correctness requirement, not a nicety**, and it
  belongs in the deliverable-match selection in `packages/db/src/queries/delivery.ts`. Decide the
  mechanism (a `is_demo` flag on `channels`, joining through the demo user ids, or an env-gated
  allowlist on staging) and state it.
- **There are 0 `kind='match'` rows** and 89 `kind='near_miss'` rows. Note that the 3 seeded
  `delivery_log` rows reference match ids via a cascading FK, so the demo matches those rows point at
  still exist — but they are all counted as `near_miss` now. Something re-homed the seeded demo
  matches into near misses. That is phase 07 territory, not yours; do not chase it.
- `job_embeddings` holds 3,631 rows, but 3,824 open enriched jobs have none. 7,400 open jobs, 7,396
  enriched, 7,372 verified live within 24 h. Supply is not the problem.
- The staging `worker` service is serving a deployment built from `c113e02` (phase 06), which
  predates the embed and match pipeline entirely. Its boot log registers no embed or match module.
  The newer build is stuck `BUILDING`. **Another session owns that deploy. Do not touch it.**

## Hard requirements the reviewers will check

- **Exactly-once per `(match, channel)`** under concurrent dispatchers *and* across a crash between
  "decided to send" and "sent". The partial unique index is the **backstop, not the mechanism**.
  Order B states its chosen ordering (claim-then-send or send-then-record), names the failure mode it
  accepts, and how a crashed claim is recovered. This is a named target for the blind review.
- **The dispatcher asks `packages/core/src/entitlements/` and nothing else** for instant vs delayed.
  It never re-derives 24 h, never reads `passes` to make that decision itself.
- `deliverAfter()` measures from the job's `first_seen_at`. `matches.deliver_after` is already
  populated; the dispatcher reads it, it does not recompute it.
- **Quiet hours** are per user in PLAN D8 but stored per channel row. The settings UI writes the same
  window to all of a user's channels in one transaction. Windows that cross midnight and DST
  transitions must both work.
- **Rate limits**: ~1 message/second per chat and a global token bucket at ~25/s, plus `autoRetry()`.
  Do not add artificial delays on top of a 429 — honour `retry_after`.
- **Webhook `secret_token` verification is mandatory** and non-negotiable.
- **Deep-link tokens**: single-use, short TTL, ≥32 bytes of entropy, base64url, ≤64 characters
  total in the `start` payload. **Store a hash, never the raw token.** Never put a user id in the payload.
- **No payments in the bot.** Telegram requires Stars for digital goods sold inside Telegram. Link to
  pemby.app for passes; do not build `sendInvoice`, and do not add a Stars flow.
- **Personal data** (CV text, profile contents, email addresses, chat ids) is never logged and never
  reaches `pgboss.job.output`. Use `safeErrorLabel`. Worker logs print variable **names**, never values.
- **PLAN D16 wording** in every message, subject line, button label and settings string. Never: job
  board, recruiter, recruitment, placement, get hired, guaranteed job, auto-apply, scrape, beat the
  ATS, "we write your CV".
- **No test suites** (PLAN D24). Proof is typecheck, lint, build and a real run of the changed flow.
- Migrations are additive, start with `SET lock_timeout = '5s';`, and an enum value addition goes in
  its own file alone. Never edit an applied migration. Never reset or reseed.
- Public AGPL repo: no secrets, prompts, weights or source lists in any committed file.
- Workers do not commit and do not deploy. The lead reviews every diff; the owner approves every commit.

## Owner checkpoints (PLAN section 8)

1. **Three Telegram message layouts**, from a real staging match, before the final one is built.
   Produced as a throwaway script against staging — not committed code — and taken through
   `/impeccable` first.
2. **The owner receives real matches on their own Telegram from staging**, with the instant/delayed
   split proven on two accounts and quiet hours proven by a held-then-released message.

## Adversarial review

One fresh, blind reviewer that did not build the code, briefed with the diff and this contract, on:
webhook verification, deep-link token handling, dispatcher double sends, rate-limit behaviour, and
anything touching personal data. Phase 07's two blind reviews found four defects that would
otherwise have shipped as working software. This is not optional.
