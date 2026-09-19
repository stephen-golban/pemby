# Phase 08 handoff: delivery over Telegram, email and web push

Written 2026-09-19. **Built, reviewed, deployed to staging.** Account linking is proven end to end
with the owner's real Telegram; **a match card has never been delivered, because staging has never
held a `kind='match'` row.** Production is untouched. (Its pinning is not what the docs say — see the drift section below.)

## What shipped (all on `main`, CI green)

| Commit | Unit |
|---|---|
| `238b590` | `packages/db` migrations 0012/0013, `queries/delivery.ts`; `packages/core/src/delivery/**`; `check:reasons` + CI step |
| `bc66991` | `apps/bot` — grammY on webhooks: linking, six commands, callbacks, flags, dead channels |
| `70daf49` | `apps/worker/src/deliver/**` — dispatcher and three senders; the `deliver_after` fix in `apps/worker/src/match/**` |
| `2b78ee1` | `apps/web` — `/settings`, push + service worker, unsubscribe/flag routes, export |
| `599935c` | `docs/phases/08-contract.md` |
| `d5462fa` | the `web-push` default-export fix and `deliver:smoke` |

The work-order contract, the ownership map across five parallel orders and the verified library
facts are in `docs/phases/08-contract.md`.

## The checkpoint, honestly

**Checkpoint 1 (message layout)** — done. The owner chose layout A, "the ledger", from three
candidates rendered from a real staging row through the real reason renderers. Amended after the
choice to use the engine's evidence reason rather than the gate's restatement of the tier.

**Checkpoint 2 (real matches on the owner's Telegram)** — **partly met.**

Proven on staging with the owner's own Telegram client: the deep link, `secret_token` verification,
the grammY handler, single-use token consumption, the `channels` write, and the bot's reply. The
`channels` row carries `verified_at`, `dead_at` null, and the token row shows `used_at` and
`used_by_chat_id` set 2m20s after issue.

Not proven, and not provable today: **a card arriving, the buttons editing the message in place,
quiet hours holding and releasing, and email or push delivering a match.** All of them need a
`matches` row of kind `match`, and staging has never had one — 211 rows, every one a near miss.

## Why there are no matches, measured

Not the threshold, and not a defect. Diagnosed by re-running the real `selectMatchCandidateUsers`
SQL against the 200 most recently completed `match.job` payloads:

| MD tier of the job | candidate users returned | jobs |
|---|---|---|
| red | 0 | 188 |
| white | 0 | 10 |
| yellow | 4 | 2 |

`users=0` is the honest answer because 198 of 200 recent jobs are red or white for Moldova and every
onboarded profile in staging is Moldovan. Three MD green/yellow jobs were checked clause by clause
and the owner **is** returned for all three — there is no excluding predicate.

Supply, of 7,368 enriched open jobs: **6 green and 300 yellow for MD (4.2%)**, narrowing to **124**
once the owner's role families and seniority band apply. All 124 were evaluated, all embedded. Best
score: **67**. `profileJobLimit` (500) was never the binding constraint — a hypothesis the phase lead
raised and the data refuted.

The whole database holds exactly **two** `blocker='score'` rows, at 67 and 71. The six rows scoring
≥75 belong to `demo_user_ana` and are blocked on *eligibility*, not score, because `include_yellow`
is false — the one-tap fix case. The owner already has it true.

**The constraint is eligible supply, not the bar.**

## Plan amendment the owner approved (2026-09-19)

**D6: the match threshold moves from 80 to 75.** Private config `config-v0.4.2`, staging only;
production was not touched (and is not pinned where the docs claim — see the drift section). Deliberately **not** 67 — that would have been fitting the
threshold to the single observed job and would have collapsed the near-miss band PLAN §4.6 defines
as 65–79. 75 keeps "strong match" meaningful and leaves the band at 65–74. **It was not expected to
produce a match today and did not.** Existing rows are not rescored automatically; a job is
re-evaluated when the matcher next reaches it.

The owner also asked that **users be able to lower their own bar**. That is not built. It changes D6,
which fixes the bar for everyone, and it belongs on the Brief — phase 07's surface. The in-pattern
home already exists: PLAN D7's near misses are grouped by blocker with one-tap fixes, and there is
already a `score` blocker group, so *"3 scored just under your bar — show them?"* reuses the
mechanism rather than adding a settings control. **Recommended for phase 09.**

## Defects this phase found that were already shipped

- **`entitlementsFor` called with an incomplete question** (phase 07's `apps/worker/src/match/map.ts`).
  Without `testPassHolders` the pass check is vacuously false for everyone, so every user resolved to
  free tier and every `deliver_after` became `first_seen_at + 24h`. **Instant delivery did not
  exist.** Worse: the dispatcher *does* pass the allowlist, so it judged the resulting 48-hour-old
  message "not late" and sent it with no D13 disclosure. Fixed with a shared `readTestPassHolders`
  feeding both callers. **The durable lesson: an optional field on a decision function is a default
  nobody chose.** The defect was in neither the module nor either caller — the type permitted an
  incomplete question. The durable fix is a required field; the shared parser is the cheap version.

- **The reason-table parity guarantee did not exist.** The 07 handoff said the English in core and in
  `messages/en/brief.json` was "compared programmatically". No such script existed. The strings were
  in fact identical, but the guarantee was held by a code comment. `check:reasons` now compares eight
  pairs in both directions and runs in CI.

## Defects this phase shipped and caught

- **The worker crash-looped on staging.** `web-push` is CommonJS and binds its exports, so
  `import { sendNotification }` threw at module load and took down ingest, enrich, embed, match and
  owner alerts — not just delivery. **Every gate passed**: `.d.ts` files describe a package's API,
  never its module format, and the dispatcher's verification stubbed the providers so the module was
  never imported. `deliver:smoke` now imports the real barrel and builds the three senders; verified
  against the broken import, where typecheck exits 0 and smoke exits 1.
  Note `WebPushError` *does* resolve as a named export — a half-fix would have looked right and still
  crashed. `import * as webPush` would have been worse than the bug: for a CJS module that namespace
  is built from the same failed analysis, so the symbol would be undefined at *call* time.

- **A migration-ordering hazard, caught before it shipped.** Drizzle decides what is pending by the
  journal's `when` timestamp, not the index. Phase 08's migrations had timestamps *earlier* than the
  phase-07 migration already applied to staging, so renumbering indices alone would have left both
  **silently skipped** — no error, just a database that never gets the delivery schema.

## The shape all of these share

Phase 07 named it and this phase kept producing it:

> A mechanism reports success about the **work it did** rather than the **outcome it achieved**, and
> nobody notices because the number that would reveal it is being read as a health metric.

Phase 08's own instances: `late` derived from the user's tier rather than from whether the message
actually waited; a green typecheck on a module that cannot load; and the lead's own `users=0`
reading, taken from a sample where the informative case is 1 in 50.

## Architecture worth knowing

- **Exactly-once**: `delivery_log` is the dispatcher's lock as well as its log. A row is claimed
  before the provider is called, so mutual exclusion happens before the irreversible act. The
  pre-existing `status='sent'` index only notices a duplicate after both messages have gone out; it
  stays as a backstop. Accepted failure mode: a crash between "provider accepted" and "commit"
  re-sends, bounded by `DELIVER_MAX_ATTEMPTS`. A duplicate card is visible and recoverable; a
  silently dropped match is the product failing at its one job.
- **Ordering**: quiet hours → entitlements → render → rate limit → claim → send → record. A held
  match writes **no row**, and no claim is held across a pacing wait or an HTTP call. Quiet hours are
  evaluated before the claim deliberately: a skip releases the lock and is not counted toward
  `maxAttempts`, so claiming first would re-claim and re-skip every match every tick for the whole
  window.
- **One card, three channels.** `packages/core/src/delivery` renders it; no sentence is written twice.
  `renderMetaLine`, `renderTierVerdict` and `renderFreshnessLine` are shared because duplicating the
  *joining* is what produced two defects here.
- **`apps/web` CAN call a `packages/db` helper** that takes a `Db`. The long-standing claim that it
  cannot is stale — there is one `drizzle-orm` in the store. What web cannot do is *write* a query,
  since it does not declare the dependency. Anything needing one implementation across surfaces (the
  link-token codec, the delivery pause) should go through the kernel.

## New services, variables and operations

- Staging bot: **`@pemby_app_staging_bot`** (id `8810709670`), domain `bot-staging-45f9.up.railway.app`.
  The `bot` and `worker` services point at the same bot. **A bot token has exactly one webhook
  globally**, which is why `setWebhook` is never called on boot — an auto-registering environment
  steals every other environment's updates. Register by hand:
  `pnpm --filter @pemby/bot webhook:set <origin>` under `railway run --service bot`.
- New staging variables: `TELEGRAM_BOT_USERNAME`, `DELIVER_*` (see `.env.example`),
  `DELIVERY_LINK_SECRET` (**must be byte-identical on web and worker** or every link in every email
  returns `invalid_token`), `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`,
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
- `DELIVER_TEST_PASS_HOLDERS` is the only route to instant delivery before phase 10. **Order matters**:
  set it, confirm `testPassHolders=1` on the `match:` boot line, *then* cause new match rows.
  `upsertMatches` uses `coalesce` on `deliver_after`, so existing rows are not retrofitted.
- `railway redeploy` **refuses** a FAILED deployment; `railway redeploy --from-source` recovers it.
- A crash-looping service still reports its deployment as SUCCESS. Read runtime logs.

## Known issues and open items

- **No match has ever been delivered.** The delivery path beyond linking is unexercised on real data.
- **Delivery latency is ~60s**, not instant: the dispatcher runs on a one-minute cron and nothing
  pushes when a match is committed. A `boss.send` from `match.job` would cut it to seconds.
- **Multi-device push delivers to one device** — `delivery_log_match_channel_live_uq` is unique on
  `(match_id, channel_type)`. Per-device push needs both the index and the query to change.
- **Quiet-held matches occupy selection slots**; nothing in SQL knows about a user's window. The
  dispatcher over-selects 4× to compensate. The real fix is a `hold_until` column.
- **Telegram flags are one level coarser than the web's** — `field` with a null `field_value`,
  because the values for `stack`/`location` come from the job's own lists. Phase 09's rules must
  handle a null value.
- **1,946 jobs have a completed `match.job` and no `matches` row**, so `last_matched_at` stays null
  and they sort first for ever. Harmless at current volume; needs a "last fan-out attempt" record,
  which touches the `matches` write path. **Phase 09.** (Found by the phase 07 lead.)
- `safeErrorLabel` exists in three places, `FLAG_USER_LIMIT` in two, and a scoring-nudge
  read-modify-write in two. None is a correctness bug; all are cleanup.
- **No push-endpoint allowlist.** A signed-in user can make the worker POST an encrypted blob to any
  https host. Deliberate: push services change hostnames without notice and a stale allowlist
  silently breaks delivery for a whole browser. **This flips if we ever read a response body or
  follow a redirect.**
- `<input type="time">` renders 12-hour under a 12-hour OS locale while the ledger reads `22:00`.
- `/settings` has no chrome-level nav entry; the header has no session awareness at all. Reached from
  the Brief and profile rails.
- **Suggested for the UI pass:** the email is the one channel that renders an absolute local time
  well — "seen live at 09:14 your time" beats an elapsed count. `EmailContext.timezone` was removed
  rather than read, because changing one channel after the owner approved a comp is a design change
  smuggled in as a fix.
- `apps/web/components/brief/reasons.ts` passes `engagement: ""`, so the Brief can render "The post
  says it's open worldwide to ." **Live on staging, phase 07's surface, unowned.**
- `{way}` renders a raw slug (`b2b-contractor`) in gate reasons on the Brief. Needs a label table in
  `brief.json` beside the reasons.

## Private-config pinning drift, found while tagging `config-v0.4.2`

Not caused by this phase and **not fixed by it** — production was out of scope. Flagged because it
looks unintended and nobody is watching it.

- **Production `web` is running `config-v0.1.0`.** The production environment has a *shared*
  `PRIVATE_CONFIG_REF = config-v0.1.0`; production `worker` overrides it to `config-v0.3.0`, and
  production `web` has no override. So the two production services are **three tags apart**, and the
  documented "production is pinned to `config-v0.3.0`" is true of the worker only.
- **Staging had the same shape.** Its shared value is `PRIVATE_CONFIG_REF = main` — an unpinned
  moving ref. `web` and `worker` overrode it; **`bot` did not, so it was floating on `main`** and
  only happened to resolve correctly because `main` sat at `config-v0.4.1`. All three staging
  services are now pinned explicitly, but **the shared `main` value is still there, so any new
  staging service floats by default.**
- `web` never prints the config boot line — it loads private config lazily rather than at boot, so
  its ref is confirmed from the variable and a clean start, not from a log line. Only `worker` and
  `bot` give direct log proof. Worth knowing when verifying a config change.
- `weights.json`'s own `version` field still reads `0.1.0`. `docs/private-config.md` requires a bump
  for *prompts* and is silent about weights. Left alone; worth a decision if weights versions are
  meant to track content.

**Recommended**: give production `web` an explicit override, and replace the shared `main` in staging
with an explicit tag, so a service can never float onto whatever config happens to be on a branch.

## Notes for phase 09

- Flag *rules* are yours; phase 08 only stores rows. Both surfaces share one counter and key
  (`flag:user:<id>`, 24h, max 10) with the per-job duplicate check running first.
- The user-adjustable threshold belongs in the near-miss one-tap fix, not a settings control.
- `packages/core/src/delivery/strings/en.ts` is the copy table for every non-React surface. Anything
  with a web twin goes in `check:reasons` — copy a string out of a watched table and it leaves the
  checker's sight.
