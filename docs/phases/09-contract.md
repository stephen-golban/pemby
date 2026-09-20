# Phase 09 work-order contract

Written 2026-09-19. Read with `docs/phases/09-kits-tracker-flags-admin.md` and
`docs/phases/_COMMON.md`. This file is the single source of truth for the workers: what already
exists, who owns which paths, and the interfaces the parallel orders code against. Workers cannot
see the lead's conversation, so nothing here may assume it.

Worktree: **`/Users/stephen/Development/Pemby-09`** (branch `phase-09`, off `origin/main` `3258dc0`
— the phase 08 tip), linked to Railway **staging only** (project `pemby`
`7e09a8d7-46ee-48bb-b819-33ba6d962831`, environment `staging`
`7a9aafd1-52f4-4d1a-820b-31d2e72541a3`). All paths below are relative to that worktree.

**Baselines on the clean tree, measured 2026-09-19:** `pnpm typecheck`, `pnpm lint` and
`pnpm build` all exit 0. If your order turns one of them red, it is your order that did it.

## The gates, and what each one is actually for

CI runs five steps (`.github/workflows/ci.yml`), not three. Know why each exists before you assume
a green run means your code works.

| Step | Command | What it proves |
|---|---|---|
| Typecheck | `pnpm typecheck` | Types agree. **Not** that a module can load. |
| Lint | `pnpm lint` | Flat ESLint config, `import type` enforced. |
| Reason parity | `pnpm --filter @pemby/core check:reasons` | The same reason key renders identically in `@pemby/core`'s tables and the web's next-intl catalogue. |
| Sender load | `pnpm --filter @pemby/worker deliver:smoke` | The delivery senders **import for real**. Added because a CommonJS package's `.d.ts` promised named exports it does not have at runtime, every gate passed, and the worker crash-looped on staging. |
| Build | `pnpm build` | `next build`. |

The durable lesson from phase 08, which every order in this phase must take personally:

> A mechanism reports success about the **work it did** rather than the **outcome it achieved**, and
> nobody notices because the number that would reveal it is being read as a health metric.

Concretely: a green typecheck on a module that cannot load; a verification that stubbed the very
thing it was verifying. **If you stub something, say in your report what that leaves unproven.**

## Conventions that bind every order

From `docs/conventions.md`. Do not rediscover these.

- Internal packages export TypeScript **source** (`"exports": { ".": "./src/index.ts" }`). No build
  step, no `dist/`. A new package must be added to `transpilePackages` in `apps/web/next.config.ts`.
- Every package is `"private": true`, `"type": "module"`, extends `tsconfig.base.json` (strict,
  `noUncheckedIndexedAccess`, `verbatimModuleSyntax`). Use `import type` for type-only imports.
- **Dependency versions are exact pins**, checked against npm or official docs when added — never
  from memory. pnpm's minimum-release-age policy applies.
- Env vars are `SCREAMING_SNAKE_CASE`, grouped by service prefix, added **by name with an empty
  value and a comment** to `.env.example`, and to `docs/SETUP.md` when an external account provides
  them. `NEXT_PUBLIC_*` must never hold a secret. Branch on `APP_ENV`, never `NODE_ENV`.
- **i18n**: every user-facing string goes through next-intl. API error bodies carry stable codes
  (`{ "error": "forbidden" }`) and the client maps codes to messages. `apps/web/global.d.ts` types
  the keys, so a missing key fails typecheck.
- **Optimistic UI**: every user mutation updates the screen at once and rolls back on failure, via
  `optimisticUpdate(queryKey, apply)` in `apps/web/lib/optimistic.ts` spread into `useMutation`, or
  React `useOptimistic` for component-local state. Show the error; never leave the optimistic value.
- Commit messages: `Phase 09: <imperative summary>`. **Workers do not commit and do not deploy.**

## Hard rules, non-negotiable

- **No test suites** (PLAN D24). Proof is typecheck, lint, build and a **real run** of the changed
  flow — a browser for UI, a script or curl for APIs and workers.
- **Privacy.** CVs, profiles, kits and embeddings are personal data. They go only through the
  private OpenRouter key with `provider: { zdr: true }`, and — when a user's own key is used —
  `provider: { zdr: true, data_collection: "deny" }` on **every** request. The public key only ever
  sees public job posts. Personal data is never logged and never reaches `pgboss.job.output`: throw
  sanitized errors (`safeErrorLabel`). Worker logs print variable **names**, never values.
- **Free text never reaches a model.** A "Wrong details" flag carries only the fixed field and value
  from its picker. Free text from an "Other" flag goes to the owner review queue and **nowhere
  else** — not to enrichment, not to a kit, not to any prompt.
- **Public AGPL repo.** No secrets, prompts, scoring weights or source lists in any committed file.
  Before a commit, `git grep -nE 'sk-or-|BEGIN (RSA|OPENSSH)|password=' -- . ':!docs'` finds nothing.
- **PLAN D16 wording** in every string a person reads — UI, emails, bot messages, metadata, buttons.
  Never: job board, recruiter, recruitment, placement, get hired, guaranteed job, auto-apply,
  scrape, beat the ATS, "we write your CV". Pemby is "AI job-matching software; you apply yourself."
- **Never server-side auto-apply** (PLAN D9, research 03 B5). Pemby prepares text a person copies
  and submits themselves. Nothing in this phase submits an application anywhere.
- **Migrations** are additive, start with `SET lock_timeout = '5s';`, and an enum value addition goes
  in its own file **alone**. Never edit an applied migration. Never reset or reseed.
  **Drizzle decides what is pending by the journal's `when` timestamp, not the index** — a migration
  whose `when` is earlier than one already applied is silently skipped, with no error.
- **Queue policy is immutable after creation.** Changing a queue's options on a later boot does not
  change the queue.
- **Design only through `/impeccable`.** desertant.com is the binding brand reference.

## Owner checkpoints (PLAN section 8, phase 09)

1. **The kit surface layout**, taken through `/impeccable`, rendered from a real staging job before
   the final one is built.
2. **The owner generates a kit against a real job on staging and judges its quality**, and applies
   to one real job with it.

## Adversarial review

Fresh, blind reviewers that did not build the code, briefed with the diff and this contract:
**user-key encryption and handling**, **owner-only admin access**, and **flag abuse paths**
(mass-flagging a real job). Phase 08's two blind reviews found 14 defects, including one that made
instant delivery not exist. This is not optional.

## Corrections to the phase file and the 08 handoff

Verified first-hand on 2026-09-19. Do not repeat the originals.

1. **`kits`, `applications` and `flags` already exist.** All three shipped in `0001_schema_v1` and are
   live on staging. `kits` (`packages/db/src/schema/matching.ts:171`) already types `content` as
   `KitContent = { cvBullets: string[]; coverLetter: string; screeningAnswers: {question,answer}[] }`
   (`:164`). `applications` is at `:139`. The phase file reads as if these are to be built. **The only
   net-new table in phase 09 is the encrypted OpenRouter user-key store.**
2. **The `application-kit` AI route already exists** — `packages/ai/src/routing.ts:87`, pointing at
   `anthropic/claude-haiku-4.5`, `keyClass: "private"`, `personalData: true`,
   `promptName: "application-kit"`, `fallbackModels: []`. `application-kit` is already a value of the
   `ai_task` enum and already in `REQUIRED_PROMPTS`.
3. **Streaming already exists.** `runStreamingStructuredTask` (`packages/ai/src/structured.ts:410`)
   streams partial JSON through an `onPartial` callback. `apps/worker/src/cv/parse/parse-cv.ts:288`
   is a working precedent. Nothing in `packages/ai` needs a streaming client built.
4. **`keyClass: "user"` is plumbed end to end** — `packages/ai/src/keys.ts:111` (`getOpenRouter`
   requires `userApiKey` for that class and refuses it for any other), routing (`routing.ts:199`),
   the cost cap (`cost.ts:30` — user-key spend never counts toward Pemby's $3), and the usage
   ledger. `key_class` already has `"user"` as a pg enum value. What is missing is **storage, OAuth
   and a caller** — nothing else.
5. **`job_status` already has `quarantined`** (`packages/db/src/schema/enums.ts:49`), and
   `flag_action` already enumerates `job_closed, reverification_queued, tier_downgraded,
   quarantined, re_enriched, merged, sent_to_review` (`:143`). PLAN section 6's whole vocabulary is
   in the schema. **No enum migration is needed for the flag rules.**
6. **PLAN section 6's tier-downgrade rule is already implemented in the eligibility engine** —
   `packages/core/src/eligibility/engine/index.ts:1320-1327`. It filters evidence to
   `source === "flag" || source === "user_report"` with `verdict === "red"`, **sums `weight`**, and
   steps the tier down once the sum reaches 2. `loadCompanyEvidence`
   (`apps/worker/src/enrich/enrich-job.ts:140`) loads every company-subject evidence row except
   `source='post'`, so flag rows already reach the engine. The rule is therefore: **write an
   `eligibility_evidence` row and call `recomputeEligibilityForCompany`.** No engine change.
   `eligibility_evidence.flag_id` (`packages/db/src/schema/flags.ts:84`) exists and is essentially
   unused: **measured 2026-09-19, staging holds exactly 1 row carrying a `flag_id`, out of 106,384
   `eligibility_evidence` rows.** (An earlier draft said "nothing writes it", which is false.)
   That table's size matters for a migration: 0 groups of `(flag_id, subject, scope)` have more
   than one row, so the wave-1 partial unique index builds, but it scans 106k rows under a lock.
7. **`requestCompanyEvidenceRecheck(boss, companyId, reason)` already exists** with
   `reason: "schedule" | "flag" | "manual"` — `apps/worker/src/company-evidence/workers.ts:72`. The
   `"flag"` value is in the type and has **no caller**. Phase 08 built the socket.
8. **`apps/web/src/` does not exist.** Routes are `apps/web/app/**`, libraries `apps/web/lib/**`,
   components `apps/web/components/**`. The phase file's `apps/web/src/app/admin/` is wrong, as the
   equivalent was in phases 06, 07 and 08.
9. **`loadExport` is at `apps/web/app/api/profile/_lib/db.ts:416`**, not :347 as the 08 contract said.
   It covers `profiles`, `cv_files`, `user` and `channels` only.
10. **`safeErrorLabel` exists in two places under that name**, not three: `apps/worker/src/cv/workers.ts:16`
    and `apps/bot/src/log.ts:19` (a deliberate copy — the bot cannot depend on the worker). There are
    three further near-duplicates under other names with **different semantics**: `errorLabel` at
    `apps/worker/src/company-evidence/workers.ts:145` (uses `error.name`, accepts numeric codes, no
    regex whitelist), `safeErrorMessage` at `apps/worker/src/ingest/ingest-board.ts:728`, and a
    file-local `errorLabel` at `apps/worker/src/scripts/company-evidence-once.ts:132`. **Do not assume
    importing one gives the output of another.**
11. **`verify-live` selects boards, not jobs.** Everything in `apps/worker/src/ingest/` is keyed on
    `companyId`; no function takes a `jobId` and asks whether one posting still resolves. The
    "closed or fake" flag rule needs a **new** per-job entry point. This is the one flag rule that
    is genuinely new code.
12. **The web flag picker has no free-text field** (`apps/web/components/brief/flag-picker.tsx`).
    `flags.note` exists in the schema and **nothing writes it on any surface**. PLAN section 6's
    "free text from Other goes to the owner review queue" therefore has no producer today. Do not
    add one without an explicit owner decision; the admin review queue must handle `note IS NULL`.

## What already exists — do not rebuild any of it

| Thing | Where | State |
|---|---|---|
| `kits` | `packages/db/src/schema/matching.ts:171` | `content` jsonb typed `KitContent`, `model`, `prompt_version`, `key_class`, `cost_usd`. Index `(user_id, created_at)` — the shape a per-month quota count wants. **No unique key**: nothing stops two kits for one (user, job). |
| `applications` | `matching.ts:139` | `state` (`application_state`), `applied_at`, `rejected_for_location`, `notes`. Unique `(user_id, job_id)`, index `(user_id, state)`. |
| `flags` | `packages/db/src/schema/flags.ts:27` | Complete. Partial unique `(job_id, user_id, reason) where user_id is not null`. `weight` real default 1 — **this is the anti-abuse knob the engine already reads**. |
| `eligibility_evidence` | `flags.ts:69` | Has `flag_id` (FK → `flags.id`, set null) and `source` including `user_report` and `flag`. CHECK forces job↔job_id / company↔company_id. |
| Tier-downgrade rule | `packages/core/src/eligibility/engine/index.ts:1320` | Sums evidence `weight`, steps the tier down at ≥ 2. |
| `requestCompanyEvidenceRecheck` | `apps/worker/src/company-evidence/workers.ts:72` | `stately` queue, `singletonKey = companyId`; returns `null` when a check is already queued (the correct no-op for a second flag). Skips companies with no `domain` or `is_demo`. |
| Streaming structured task | `packages/ai/src/structured.ts:410` | `onPartial` awaited inside the read loop, so calls never overlap. On stream failure it silently falls back to the non-streaming chain and returns `streamed: false`. |
| ZDR enforcement | `packages/ai/src/keys.ts:39` `withEnforcedZdr` | Wraps `fetch`, JSON-parses every outgoing body, merges `{ zdr: true, data_collection: "deny" }` **over** the caller's `provider`, fails closed on a non-JSON body. Applies to `private` **and** `user`. |
| Cost cap | `packages/ai/src/cost.ts` | `DAILY_CAP_USD = 3`; `AI_DAILY_CAP_USD` may only lower it. Throws `DailyCapReachedError` with `retryAt`; the caller queues and alerts. **User-key spend is excluded from the cap** (`cost.ts:30`). |
| Entitlements | `packages/core/src/entitlements/index.ts` | `entitlementsFor`, `deliverAfter`, `isPassActive`, `FREE_KIT_QUOTA_PER_MONTH = 3`. `kitQuota` is on the return type at `:30` and **has no consumer today**. |
| Admin queries | `packages/db/src/queries/source-health.ts:57`, `queries/ai-usage.ts:149` | `getSourceHealth(db)` and `aiUsageTotals(db, {since, runLabel})` already exist and are exported. Two of the admin page's four panels are already backed. |
| Rate-limit counter | `apps/web/lib/cv/rate-limit.ts`, copied at `apps/bot/src/store-db.ts:79` | Fixed-window upsert on `rate_limits`, returns the count including this call, **fails closed**. Key `flag:user:<id>`, 24 h, max 10. Duplicate check runs **first**, so the limit counts stored flags. |
| Telegram message ids | `apps/worker/src/deliver/senders/telegram.ts:120` → `dispatch.ts:314` → `queries/delivery.ts:612` | `delivery_log.provider_message_id` **is** populated for Telegram. A web-side state change can edit an already-sent card. |
| Optimistic helper | `apps/web/lib/optimistic.ts:12` | Best exemplar `apps/web/app/brief/_shared/use-brief.ts`. It **owns** `onMutate`/`onError`/`onSettled`; surface error state goes in per-call options to `mutate`, never by overriding them. |
| Editor primitives | `apps/web/app/profile/_shared/fields.tsx` | `Ledger`, `FieldRow`, `ChoiceEditor`, `MultiChoiceEditor`, `YesNoEditor`, `NumberEditor`, … plus `fields.module.css` and `panels.module.css`. `apps/web/app/settings/settings-client.tsx:7` already imports them cross-surface. **Import, do not fork.** |
| Inline picker | `apps/web/components/brief/picker.tsx:14` | Inline disclosure, not a modal. Focus moves to the first option, Escape closes, focus returns to the opener. |

## Verified library and API facts (2026-09-19, primary sources)

Pin these exact versions. Do not take a version from memory. Where the installed package's own
`.d.ts` and the published docs disagree, **the installed code wins**.

| Package | Installed | Note |
|---|---|---|
| `ai` | **7.0.101** | npm `latest` is 7.0.107. Same minor. No reason to bump. |
| `@openrouter/ai-sdk-provider` | **3.0.0** | 3.1.0 shipped 2026-09-19 and adds only `openrouter.evaluationModel()` (which needs `ai@7.0.103+`). **Nothing in the chat / streaming / ZDR path changed. Do not bump.** |
| `zod` | 4.6.5 | |
| `next` / `react` | 16.3.5 / 19.3.0 | |
| `better-auth` | 1.7.5 | |
| `@tanstack/react-query` | 5.102.8 | |
| `@ai-sdk/react` | **not installed** | `useChat` lives here. Adding it is a new dependency. |

**Streaming a Response from a Next.js Route Handler at `ai@7.0.101`** — read from
`packages/ai/node_modules/ai/dist/index.d.ts`:

- `toDataStreamResponse` **does not exist** at this version. That name is AI SDK v4. Do not let it
  into any file.
- `result.toUIMessageStreamResponse()`, `result.toTextStreamResponse()`, `result.toUIMessageStream()`
  and both `pipe*` methods are all **`@deprecated`** on disk, "will be removed in the next major".
- `result.fullStream` is **deprecated**; the property to read is **`result.stream`** (`:2811`).
- The non-deprecated path is the standalone helpers:
  `createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream }) })`
  (`:6106`, `:6179`), or `createTextStreamResponse({ stream: toTextStream({ stream }) })`
  (`:9338`, `:9363`) when message parts are not needed.

**Getting `provider: { zdr, data_collection }` through the provider — there is a real trap here.**

- The typed home for `provider` is the **model-factory settings** (`openrouter(id, { provider })`) or
  `createOpenRouter({ extraBody })`. `OpenRouterProviderOptions` — the type of
  `providerOptions.openrouter` — contains only `models`, `reasoning` and `user`. It has **no
  `provider` key**.
- At runtime the compiled provider spreads `providerOptions.openrouter` onto the request body
  **unvalidated and last**, so a call site that passes `providerOptions: { openrouter: { provider: {...} } }`
  **replaces the whole `provider` object and silently drops `zdr`**. That is a privacy failure that
  typechecks only via a cast, but it is real.
- **The guarantee is `withEnforcedZdr` in `packages/ai/src/keys.ts:39`, not the SDK type.** Every kit
  request must go through `getOpenRouter("private" | "user")` from `@pemby/ai`. **No route handler
  may construct its own `createOpenRouter`.** This is a named target for the blind review.

**`anthropic/claude-haiku-4.5` on OpenRouter, under ZDR.** The slug is correct. 200,000 context,
64,000 max completion, $1.00 / M in, $5.00 / M out. `GET /api/v1/endpoints/zdr` lists **six** ZDR
endpoints for it — and **Anthropic's own first-party endpoint is not among them**:

| Provider | `structured_outputs` |
|---|---|
| `amazon-bedrock/global`, `/us`, `/eu-west-1` | **yes** |
| `google-vertex/global`, `/us-east5`, `/europe` | **no** |

Consequence: `structured.ts:328` already sends `require_parameters: true`, which under `zdr: true`
narrows routing to the **three Bedrock endpoints**. That is correct and already works — the one
`application-kit` row on staging cost $0.0042. Do not remove `require_parameters`, and do not assume
a Vertex endpoint can serve a schema.

**OpenRouter OAuth PKCE, re-read 2026-09-19.**

- Step 1: `https://openrouter.ai/auth?callback_url=<url>&code_challenge=<c>&code_challenge_method=S256`.
  `code_challenge` for S256 is the base64url SHA-256 of the verifier. Optional: `key_label`,
  `workspace_id`, `required_workspace_id`.
- Step 2: `POST https://openrouter.ai/api/v1/auth/keys` with
  `{ code, code_verifier, code_challenge_method }`.
- **Codes are single-use and expire 10 minutes after issuance.**
- Documented errors: `400 Invalid code_challenge_method`, `403 Invalid code or code_verifier`,
  `403 Authorization code expired`, `405 Method Not Allowed`.
- **CORRECTED 2026-09-20 against the live endpoint. The documented status codes are wrong.** A
  refused code answers **`400 {"error":{"message":"Invalid code","code":400}}`**, not 403 — and so
  does a request with `code_challenge_method: "plain"`, because the code is validated first, so the
  documented `400 Invalid code_challenge_method` is unreachable by that route. **Treat 400 and 403
  identically at the exchange.** Order B mapped only 403, exactly as this table said, and its first
  real run returned an unclassified failure. Anyone building from the documented table alone ships
  that bug. `GET /api/v1/key` with a bad key does answer 401 as documented.
- The three 403 reasons (code spent, code expired, verifier mismatch) are distinguishable only by
  English message text, so they collapse to one code. Our own 600-second cookie expiry catches a
  genuinely expired code first, which is a more honest answer than OpenRouter can give.
- **Build against `{ key }` only.** Any further response field is UNVERIFIED — the OpenAPI route
  serves boilerplate and `openapi.yaml` returns HTML.
- Deep links for the user to manage their own key: lowercase-hex SHA-256 of the key →
  `https://openrouter.ai/keys/<hash>` and `https://openrouter.ai/logs?api_key_hash=<hash>`. They
  resolve only for the signed-in owner. **Pemby cannot revoke a user's key** — `DELETE /api/v1/keys/{hash}`
  needs a management key on the user's own account. "Disconnect" means deleting our copy and linking
  them there.

**402 is not one condition.** Branch on `error.metadata.limit_source`, never on the message text:

| `limit_source` | Meaning | Retry? |
|---|---|---|
| `openrouter_credits` | Balance cannot cover it | No |
| `openrouter_key_limit` | The key's own cap is exhausted; see `limit_remaining` / `limit_reset` | No |
| `openrouter_in_flight_budget` | **Transient.** Sends `Retry-After`; can fire with a positive balance | Yes |

No SDK retries a 402 on its own, `ai@7` included.

**CORRECTED 2026-09-19, after a blind review demonstrated it.** An earlier draft of this section said
that on a streaming request which already returned 200, a later error "arrives as an SSE data event,
not an HTTP status". That is true of the **wire** and false of **what `ai@7.0.101` hands the
caller**: the SDK wraps the provider's error part in a `StreamProviderError`
(`name: "AI_StreamProviderError"`), which **is** an `Error` and for which
`APICallError.isInstance(...)` is `false`, with the OpenRouter body left at `error.data`. Code built
to the original sentence classifies every mid-stream 402 as `network` with a null status.

Measured, through the real provider and the real `streamText(...).stream`:

```
constructor.name        : StreamProviderError
APICallError.isInstance : false
describeFailure(e)      : {"status":null,"errorType":"network","limitSource":null}
```

A **pre-stream** HTTP 402 does arrive as a genuine `AI_APICallError` and classifies correctly. Both
paths must work, and **an assertion about either must be made against a real object produced by the
real provider** — `packages/ai/scripts/check-zdr.ts:352-372` scripts a fetch and is the pattern to
copy. A hand-built fixture shaped like the wire format passes while the production path is broken:
that is how this defect survived a green check, and it is the same shape as the phase-08 crash-loop.

`GET https://openrouter.ai/api/v1/key` (Bearer the user's key) returns `data.{ label, limit,
limit_remaining, limit_reset, usage, usage_daily/weekly/monthly, byok_usage*, is_free_tier,
include_byok_in_limit, free_model_daily_requests }`. `limit_remaining` is the **key's** cap, not the
account balance; a connected inference key **cannot** read the account balance (`/api/v1/credits`
needs a management key).

**AES-256-GCM at rest, Node 24 built-ins. No new dependency.** Verified by running it on
`node v24.18.0`, not quoted from docs.

- Blob layout **`version(1) || iv(12) || authTag(16) || ciphertext`**, base64 into one `text` column.
- **IV is 12 bytes, always, from `randomBytes(12)` per encryption.** Node **does not enforce** the
  length — an 8-byte and a 16-byte IV are both accepted silently. Never derive an IV from a user id,
  a row id or a counter: an (key, IV) reuse under GCM leaks the XOR of plaintexts *and* compromises
  the authentication key, letting an attacker forge tags.
- `getAuthTag()` **after** `final()`; `setAuthTag()` **before** `final()`. Omitting the tag on decrypt
  makes `final()` throw, as does one flipped ciphertext byte — so a decrypt that "works" without
  authentication does not exist. That is the good failure mode; do not defeat it.
- **The footgun that fails silently:** the secret must be base64-**decoded** and asserted to be 32
  bytes. A 32-byte key base64-encodes to 44 characters, and `Buffer.from(secret)` without an encoding
  gives 44 bytes → Node throws `Invalid key length`, loudly. But a **24-byte** secret base64-encodes
  to exactly 32 characters, so `Buffer.from(secret)` is a *valid* 32-byte key and everything works
  with a third less entropy and no error. Always `Buffer.from(secret, "base64")` **and**
  `assert key.length === 32`.
- The version byte is in the layout **from the first row**, not added later: adding it later is a
  migration over every stored blob, and that is the migration you have not written when a secret
  leaks. (Corrected 2026-09-19: an earlier draft of this section gave the layout without the
  version byte and then asked for one two bullets later. The layout above is the one that is built.)

**EU AI Act Article 50 — in application since 2026-08-02, 48 days ago.**

Regulation (EU) 2024/1689 Art. 113 applies from 2026-08-02; Article 50 sits in Chapter IV and falls
under that general date. The Digital Omnibus (Reg (EU) 2026/1744, in force 2026-07-27) replaced
**only Art. 50(7)** and deferred only the Chapter III high-risk dates (2027-12-02 / 2028-08-02).
Art. 111(4)'s 2026-12-02 transitional covers systems **placed on the market before 2026-08-02** and
therefore **does not** cover a feature phase 09 ships now.

| | Status |
|---|---|
| Visible disclosure that kit content is AI-generated, at first exposure, accessible | **Required** — Art. 50(1) + 50(5) |
| Machine-readable marking of the generated text as Pemby serves and stores it | **Required** — Art. 50(2) |
| Marking that survives the user pasting into an employer's form | **Not required by the text**; per Commission guidance, not expected for free-form text |
| Adhering to the Code of Practice on Transparency of AI-Generated Content | Prudent, not required |

The "assistive function for standard editing" carve-out in Art. 50(2) is **not available** here: a
cover-letter generator writes new prose and substantially alters the semantics. Do not build to the
carve-out. A visible "generated with AI, edit before you send" line in the kit UI is required anyway
and squares with PLAN D16.

## Staging reality, measured 2026-09-19 (read-only probe)

Staging is exactly at repo HEAD — `0013_delivery_kernel`, applied 2026-09-18 16:01 UTC. **Nothing
pending, no drift.** A new migration's journal `when` must exceed **1789747284250**.

**The job side is rich; the user side is empty.** Before you assume a table has data, read this.

| | |
|---|---|
| `jobs` | 7,816 total · 7,388 open · **100% enriched, 99.6% embedded** · 30 `is_demo` · 1 `quarantined` (a demo row) |
| `company_source_health` | 303 boards · 3,955 runs · **1 error all-time** · 0 failing, 0 stale today |
| `ai_usage` | 16,077 rows · $2.72 all-time · **today $0.0230 of the $3 cap (0.77%)** · only **8 rows** carry a `user_id` · **one `application-kit` row**, $0.0042 |
| `flags` | **2 rows**, both seed, both 2026-09-16 · 0 with `field` · 0 with `note` · no job carries more than one flag · **one is `status='open'`** (see the correction below) |
| `matches` | 208 · **all `near_miss`, zero `kind='match'`** · blockers: eligibility 181, freshness 14, seniority 8, salary 2, **score 2** |
| `delivery_log` | 3 seed rows, all `sent`, **zero `error` rows ever** |
| `channels` | 4 (2 telegram, 2 email), all verified, none dead · **no push subscription has ever existed** |
| `kits` / `applications` | 1 and 2 rows, all seed |
| Users | 5, of which **4 are seed**; 4 profiles, all onboarded |
| `rate_limits` | 3 rows, all `cv:*`. Nothing has ever rate-limited a flag. |

**What phase 09 can prove on staging, and what it cannot.**

- **Can, on real data:** AI spend today vs the cap and by task / model / key class; source health
  across 303 boards; a kit generated against a real open job (a kit is per (user, job) and needs no
  `matches` row); the free-quota block; a connected user key and its `ai_usage` row.
- **Cannot without the owner acting:** the flag review queue, a scam-flag quarantine, a
  closed-flag close. There is no `scam` flag and no multi-flag job on staging. **The intended proof
  is the owner flagging a real job from their own Brief**, not synthesised rows.
- **Cannot at all this phase:** a delivery-failures panel with real rows (zero `error` rows have
  ever existed), and anything that needs a delivered match card.

**Two traps in the data itself.**

1. `ai_cap_alerts` holds a row for 2026-09-17 with **`cap_usd = 0.000000`** — a forced-zero-cap test,
   not a real $3 breach. An admin panel that renders "cap hit" from that table shows a hit that never
   happened. **Read the real cap from `readDailyCapUsd`, and treat that row as what it is.**
2. Only 8 of 16,077 `ai_usage` rows carry a `user_id`, so a per-user spend view renders essentially
   blank. Say so in the UI rather than showing an empty table that looks broken.

**Demo exclusion is a correctness requirement, not a nicety.** `is_demo` exists on exactly three
tables — `profiles`, `companies`, `jobs`. It does **not** exist on `kits`, `applications`, `flags`,
`ai_usage`, `matches`, `channels` or `delivery_log`, and the seed writes demo rows into every one of
them. The established mitigation is phase 08's, documented at `packages/db/src/queries/delivery.ts:192`:
**join `profiles.is_demo = false` rather than add a per-table flag**, because a new column defaults
to `false` on exactly the rows you would then act on. Concretely: a kit worker must not spend real
money writing a cover letter for a fictional person, and a flag rule must not close a real job on
the evidence of two seeded flags.

## Ownership map

No two concurrent orders write the same file. Wave 1 runs alone because every wave-2 order
typechecks against its exports.

| Order | Model | Owns | Must not touch |
|---|---|---|---|
| **K1 — db kernel** (wave 1) | opus | `packages/db/src/schema/**`, `packages/db/drizzle/**`, `packages/db/src/queries/{flags,kits,applications,user-keys,admin}.ts`, `packages/db/src/index.ts` | `packages/core/**`, `packages/ai/**`, `apps/**` |
| **K2 — core + ai kernel** (wave 1) | opus | `packages/core/src/entitlements/**`, `packages/core/src/kits/**`, `packages/core/src/tracker/**`, `packages/core/src/delivery/strings/en.ts`, `packages/core/src/index.ts`, `packages/core/scripts/check-reasons.ts`, `packages/ai/src/{user-key,errors}.ts`, `packages/ai/src/structured.ts` (402 taxonomy only), `packages/ai/src/index.ts`, **plus the three `entitlementsFor` call sites** `apps/worker/src/match/map.ts`, `apps/worker/src/deliver/dispatch.ts`, `apps/web/lib/teaser/sql-source.ts` | `packages/db/**`, `packages/ai/src/keys.ts`, every `apps/` path not named here |
| **A — kit + Brief surface** (wave 2) | opus | `apps/web/app/api/kit/**`, `apps/web/app/kit/**`, `apps/web/components/brief/{match-row,near-miss-groups,shown-settings}.tsx`, `apps/web/app/brief/**`, `apps/web/app/api/brief/**`, `apps/web/messages/en/{kit,brief}.json` | every other `apps/web` path, `packages/**` |
| **B — OpenRouter connect** (wave 2) | opus | `apps/web/app/api/openrouter/**`, `apps/web/app/settings/**`, `apps/web/components/settings/**`, `apps/web/messages/en/settings.json` | `apps/web/app/brief/**`, `apps/web/app/api/brief/**`, `packages/**` |
| **C — tracker (web)** (wave 2) | opus | `apps/web/app/tracker/**`, `apps/web/app/api/applications/**`, `apps/web/components/tracker/**`, `apps/web/messages/en/tracker.json`, `apps/web/lib/queue/index.ts`, `apps/web/app/api/profile/_lib/db.ts` (export only) | `apps/worker/**`, `apps/bot/**`, `packages/**` |
| **D — worker: flag rules + tracker sync** (wave 2) | opus | `apps/worker/src/flags/**`, `apps/worker/src/tracker/**`, `apps/worker/src/index.ts`, `apps/worker/src/enrich/**`, `apps/worker/src/ingest/**`, `apps/worker/package.json`, `.env.example` | `apps/web/**`, `apps/bot/**`, `packages/**`, other `apps/worker/src/*` modules |
| **E — admin page** (wave 2) | opus | `apps/web/app/admin/**`, `apps/web/app/api/admin/**`, `apps/web/lib/access/owner.ts`, `apps/web/messages/en/admin.json` | everything else |

`.env.example` belongs to **D alone**. Every other order that needs a variable states its name in its
report and D adds it. `apps/web/lib/access/paths.ts` belongs to **E alone**.

## Cross-order interfaces

Wave 1 publishes these; every wave-2 order codes against them without reading wave 1's internals.
K1 and K2 each pre-create any slot a wave-2 order fills as a typed stub that throws, exported from
the package index, so the later order fills a slot that already typechecks.

```ts
// packages/core/src/entitlements — K2. THREE entry points, not one. Ask the narrowest question you
// can actually answer; a caller that cannot answer the quota question is never handed a quota.
export type DeliveryEntitlements = Omit<Entitlements, "kitQuota">;

export interface DeliveryEntitlementsInput {
  userId: string;
  pass: ActivePass | null;
  includeYellow: boolean;
  now: Date;
  testPassHolders: readonly string[];   // REQUIRED. Phase 08's worst defect was its absence.
}
export interface EntitlementsInput extends DeliveryEntitlementsInput {
  ownKeyConnected: boolean;             // changes kitQuota and NOTHING else
}

// Tiers only — the logged-out teaser. No user id, no pass, no allowlist.
export function allowedTiersFor(input: { includeYellow: boolean }): readonly EligibilityTier[];
// Plan, delivery mode, tiers — the matcher and the dispatcher. No kitQuota in the return type.
export function deliveryEntitlementsFor(input: DeliveryEntitlementsInput): DeliveryEntitlements;
// The full answer including kitQuota — the kit path, the only caller that reads the user-key table.
export function entitlementsFor(input: EntitlementsInput): Entitlements;

// packages/core/src/kits — K2. Pure, no DB types, no React.
export const KIT_SECTIONS = ["cvBullets", "coverLetter", "screeningAnswers"] as const;
export function kitQuotaVerdict(input: {
  entitlements: Pick<Entitlements, "kitQuota">; usedThisMonth: number;
}): { allowed: true } | { allowed: false; reason: "quota"; choice: "pass-or-connect" };
// `Pick`, not the whole `Entitlements` — strictly more permissive; a full one still passes.
// Fails CLOSED on a NaN or negative count. The count comes from `countKitsThisMonth` (kits rows,
// per calendar month), never from `ai_usage`, whose rows are per model ATTEMPT.
export function normalizeKitContent(content: KitContent): KitContent;  // bounds live HERE, not in zod
export function buildKitInput(parts: KitInputParts): { text: string; truncated: boolean };

// packages/core/src/tracker — K2. Pure mapping between matches.state and application_state.
export const TRACKER_COLUMNS = ["saved", "applied", "interview", "offer", "rejected"] as const;
export function trackerColumnOf(input: {
  matchState: MatchState | null; applicationState: ApplicationState | null;
}): TrackerColumn | null;

// packages/ai — K2.
export function encryptUserKey(plaintext: string, env?: EnvLike): string;   // v || iv(12) || tag(16) || ct
export function decryptUserKey(blob: string, env?: EnvLike): string;
export type PaymentRequiredKind = "credits" | "key-limit" | "in-flight";
export function paymentRequiredKindOf(error: unknown): PaymentRequiredKind | null;

// packages/db — K1. Every helper takes a Db; apps/web may CALL these but may not write a query.
export function countKitsThisMonth(db: Db, userId: string, now: Date): Promise<number>;
export function insertKit(db: Db, row: NewKit): Promise<{ id: string }>;
export function upsertApplication(db: Db, row: NewApplication): Promise<void>;
export function selectTracker(db: Db, userId: string): Promise<TrackerRow[]>;
export function selectFlagsForReview(db: Db, limit: number): Promise<FlagReviewRow[]>;
export function selectQuarantinedJobs(db: Db, limit: number): Promise<QuarantinedJobRow[]>;
export function selectDeliveryFailures(db: Db, since: Date): Promise<DeliveryFailureRow[]>;
export function claimFlagsToProcess(db: Db, limit: number): Promise<FlagToProcess[]>;
export function recordFlagAction(db: Db, p: { flagId: string; status: FlagStatus; action: FlagAction }): Promise<void>;
export function insertFlagEvidence(db: Db, p: FlagEvidenceRow): Promise<void>;  // sets flag_id
export function upsertUserAiKey(db: Db, p: { userId: string; blob: string; keyHash: string }): Promise<void>;
export function loadUserAiKey(db: Db, userId: string): Promise<{ blob: string } | null>;
export function deleteUserAiKey(db: Db, userId: string): Promise<void>;
```

**`apps/web` CAN call a `packages/db` helper that takes a `Db`, and CANNOT write a query.** There is
exactly one `drizzle-orm` in the store, but `apps/web/package.json` does not declare it, so
`import { eq } from "drizzle-orm"` does not resolve. Ordinary per-surface reads stay raw SQL on
`getDb().$client`, matching every existing `_lib/db.ts`. Anything whose correctness depends on **one**
implementation — the quota count, the user-key codec, the flag action write — goes through the
kernel helper from web as well as from the worker.

## Hard requirements the reviewers will check

- **The kit quota comes from `packages/core/src/entitlements/` and nowhere else.** No caller
  re-derives 3, no caller reads `passes` to decide. `testPassHolders` is now required, so forgetting
  it is a compile error rather than a silent downgrade to the free plan — the phase-08 defect in the
  money path this time. `kitQuota` is **not** counted from `ai_usage`: those rows are per *attempt*,
  not per kit. Count `kits` rows per user per calendar month.
- **Every kit request goes through `getOpenRouter("private" | "user")`.** No route handler builds its
  own `createOpenRouter`. `withEnforcedZdr` is the guarantee; the SDK type is not. Nothing may pass a
  `provider` object through `providerOptions.openrouter`.
- **The admin page uses a dedicated `isOwner(session)`** that calls `isAllowlistedEmail`
  **unconditionally**, never `getProductAccess` alone. `getProductAccess`
  (`apps/web/lib/auth/session.ts:22`) only checks the allowlist when `ownerGateEnabled()` is true,
  which is `appEnv() === "production" || OWNER_GATE === "on"`. **Staging has no `OWNER_GATE`
  variable and open sign-up**, so an admin page behind `getProductAccess` is readable today by
  anyone who signs up, and would be readable in production the day sign-up opens. Named target for
  the blind review.
- **Free text never reaches a model.** A "Wrong details" flag contributes only the fixed field and
  value from its picker as an enrichment hint. `flags.note` goes to the owner review queue and
  nowhere else. Note that a Telegram `wrong_details` flag carries `field` with a **null**
  `field_value` (`apps/bot/src/store-db.ts:407` writes five columns and `field_value` is not one) —
  so the rules must handle a field name with no value, and must not invent one.
- **Demo users are excluded from every rule that spends money or changes a real job**, by joining
  `profiles.is_demo = false`.
- **`retireStaleMatches` must learn about any new user-owned artifact pointing at `matches.id`.** Its
  "safe to delete" predicate (`packages/db/src/queries/matching.ts:826-830`) already guards
  `applications` and `kits`; a new table with a `match_id` needs a clause or its rows are deleted and
  the FK silently nulled.
- **The user-key table cascades from `user.id`.** `restrict` breaks `deleteUserAndCvRows`
  (`apps/web/app/api/profile/_lib/db.ts:496`, which only knows about `cv_files`); `set null` leaves an
  orphaned encrypted secret. **Account export must gain `kits`, `applications` and `flags`** —
  deletion already works through the cascades.
- **A stored user key is never logged, never returned to the browser, and never leaves the server.**
  Store the ciphertext and a SHA-256 hash of the key (for the OpenRouter deep links) and nothing
  else. The PKCE verifier lives in an httpOnly, SameSite cookie for the 10 minutes the code is valid.
- **Queue policy is immutable after creation.** Every module's `ensureQueue` destructures `policy`
  out before `updateQueue`, so a changed policy constant typechecks, deploys, boots green and does
  nothing. A new queue needs a new name, and **must be created before any handler that sends to it
  starts** — see the ordering note at `apps/worker/src/index.ts:226-231`.
- **`enrich.job` is a `standard` queue, so `singletonKey` creates no unique index and `send` never
  returns `null` for a duplicate.** A flag-triggered re-enrichment must do its own dedup exactly as
  the sweep does (`apps/worker/src/enrich/workers.ts:116-122`), or it double-spends a model call. It
  must also reach `{ force: true }`: `computeEnrichment` returns `skipped: "up-to-date"` whenever the
  content hash is unchanged, and a job's text has not changed because someone flagged it.
- **Personal data never reaches `pgboss.job.output`.** Throw `new Error(safeErrorLabel(error))`,
  never the original. Worker logs print variable **names**, never values.
- **Art. 50 disclosure** is in the kit UI at first exposure, and the stored/served kit carries a
  machine-readable marking. See the fact table above.
- **PLAN D16 wording** in every string. Never "we write your CV" — the kit is a draft the user edits
  and sends themselves. Nothing in this phase submits an application anywhere.
- **No test suites.** Proof is typecheck, lint, build and a real run. **If you stub something, say
  what that leaves unproven.**

## Amendments made during the build

- **Kit output bounds live in `normalizeKitContent`, not in the zod schema.** An earlier draft of
  this contract read as if the caps belonged in the schema. The repo's own convention
  (`packages/core/src/profile/schema.ts:5-16`) is the opposite, and it is right: a schema that
  rejects one over-long bullet costs a **paid repair retry** for a cosmetic overrun. The limits are
  stated in `.describe()` for the model and enforced after parsing. A reviewer briefed from this
  contract should **not** flag the absence of `maxItems` / `maxLength` as a miss.
- **`entitlementsFor` became three functions**, not one with a required field:
  `allowedTiersFor` (tiers only — the logged-out teaser), `deliveryEntitlementsFor` (returns
  `Omit<Entitlements, "kitQuota">` — the matcher and the dispatcher) and `entitlementsFor` (adds
  `kitQuota`, needs `ownKeyConnected` — the kit path). A caller that cannot answer the quota question
  is never handed a quota number, so nothing is invented to satisfy a type. **The kit quota is still
  decided in this one module and nowhere else.**
- **`flags.processing_at`** was added by K1 and was not in the original order. Rationale accepted:
  the four `flag_status` values are all **verdicts**, so writing one before a rule has decided would
  be false, and a fifth value would need a migration file of its own. A nullable claim timestamp with
  `for update skip locked` mirrors `delivery_log`'s claim in `0013` — a crashed processor means a
  flag is looked at twice, never that it is lost. This matters because re-enrichment costs a model
  call, so processing one flag twice is a double spend against a real job.
- **`check:kernel` and `check:user-key`** are new package scripts that execute the kernel code in
  process. **Order D adds both to `.github/workflows/ci.yml`**, which brings the gate table to seven
  steps. `.github/workflows/ci.yml` belongs to order D alone.

## Owner decisions, taken 2026-09-19

These are settled. Do not reopen them; if one looks wrong, say so in your report and stop.

1. **Tracker states map; the enum is not changed.** `TRACKER_COLUMNS = saved | applied | interview |
   offer | rejected`. `saved` reads from `matches.state = 'saved'` with no `applications` row;
   `applied`, `offer` and `rejected` read from `applications.state`; **`interview` folds `screening`
   and `interviewing`**. `withdrawn` and `no_response` stay reachable as secondary states but are not
   columns. No enum value is added and no migration touches `application_state`. The mapping is one
   pure function in `packages/core/src/tracker/` and **both surfaces call it** — a second mapping is
   how the two ends drift.

2. **The user-adjustable score bar is IN**, as a near-miss one-tap fix on the Brief (order A), not a
   settings control. This amends PLAN D6, which fixes the bar for everyone. K1 adds
   `profiles.score_floor` (nullable smallint). Null means the configured threshold — the private
   config value, currently 75 on staging — so an untouched profile behaves exactly as today. The fix
   pill's count must be the number of rows the tap actually delivers, not the group size: the
   honest-count discipline at `apps/web/app/api/brief/_lib/view.ts:171-180`. A floor below the
   near-miss band's own floor (65) is refused server-side; the band is what makes the fix meaningful.

3. **Web → Telegram card sync is built and shipped as UNPROVEN.** A web-side tracker state change
   enqueues `tracker.sync`; the worker reads `delivery_log.provider_message_id` and edits the sent
   card's markup. **No match card has ever been delivered on staging**, so the only thing that can be
   proven this phase is that the job runs and the query returns — not that a real card edits. Order D
   states exactly that in its report, and the handoff repeats it. This is the phase-08 lesson applied
   in advance: a green gate on a path whose real input has never existed proves the work, not the
   outcome.

4. **The `application-kit` prompt is drafted by the lead and committed by the owner** to the private
   config repo, then tagged and pinned. **No prompt text appears in this repo, in any work order, or
   in any report.** Workers build against the contract's input and output shapes and run against
   `private-config.example` until the real tag is pinned; a kit generated against the placeholder
   proves the path and proves nothing about quality.

## Cross-order interface: `tracker.sync` (C enqueues, D implements)

```ts
// Queue name and payload. C sends; D creates the queue and handles it.
export const TRACKER_SYNC_QUEUE = "tracker.sync";
export interface TrackerSyncData { matchId: string }
```

C sends through `apps/web/lib/queue/index.ts`'s existing send-only client, adding
`"tracker.sync"` to its declared queue-name union. It does **not** create the queue — the web
client runs with `createSchema: false` and `migrate: false`. **D creates the queue, and must create
it before any handler that sends to it starts** (`apps/worker/src/index.ts:226-231`). Until D's
module is registered, a send from web is a no-op against a missing queue, which is the correct
failure while the two orders are in flight.

## Why K2 owns three files in `apps/`

Making `testPassHolders` required is a breaking change to `entitlementsFor`, and exactly three call
sites exist: `apps/worker/src/match/map.ts:243`, `apps/worker/src/deliver/dispatch.ts:238` (both
already pass it) and `apps/web/lib/teaser/sql-source.ts:403` (which deliberately omits it, because it
reads only `allowedTiers` and a free plan is the safe floor there). A required field that one caller
cannot honestly supply is a field that will be faked, so K2 **splits the tier-only question out**:

```ts
// packages/core/src/entitlements — the question the teaser is actually asking.
export function allowedTiersFor(input: { includeYellow: boolean }): readonly EligibilityTier[];
```

The teaser calls that; nothing passes a fabricated allowlist to keep the compiler quiet. No wave-2
order may touch those three files.

## Two corrections found during the build, both for order D

1. **The two staging flags are NOT "both pre-actioned".** An earlier draft of the staging table said
   so and it is materially misleading. One row is `status='auto_resolved'`. The other is
   **`status='open'` while carrying `action_taken='reverification_queued'`** — `status` and
   `action_taken` have drifted apart on that row. Anything selecting `status='open'`, including
   `claimFlagsToProcess`, sees it, and **the only thing keeping it out is the demo guard**. Verified
   against staging: `countIndependentFlags` returns `{weightSum: 0, users: 0, flags: 0}` for both
   rows, because both the job and the flagger are demo. The demo guard is load-bearing here, not
   decorative — order D must not treat it as belt-and-braces.

2. **The two flag surfaces disagree about what "already flagged" means.** The partial unique index
   is `flags_job_user_reason_uq` on `(job_id, user_id, reason) where user_id is not null`
   (`packages/db/src/schema/flags.ts:60`). But the bot's duplicate check is `(job_id, user_id)` with
   **no reason** (`apps/bot/src/store-db.ts:391-393`), and the web route's `hasFlagged` matches the
   bot. So the effective rule — one flag per job per person, whatever the reason — is **stricter than
   the schema enforces and is implemented in application code on two surfaces independently**. A
   third writer, including a phase-09 backlog job that inserts flags, inherits neither. Order D must
   decide deliberately which rule its rules assume, and say so.

## Demo exclusion in the admin helpers: a deliberate inversion

`claimFlagsToProcess` and `countIndependentFlags` exclude demo, because they feed rules that spend
money and change real jobs. **The three `admin.ts` helpers deliberately do not.** They are read-only
observability panels: they spend nothing, change nothing and send nothing, and a panel that silently
drops rows lies to the one person whose job is to know what is in the database. On staging, where
four of five users are seeded, filtering would leave the owner looking at three empty panels with no
way to tell "nothing happened" from "nothing is shown".

Instead **every admin row carries `isDemo` and the page decides.** Order E renders that distinction
visibly rather than dropping the rows — the EXAMPLE stamp in `DESIGN.md` is the established way this
codebase marks fictional data, and the same rule applies here: never let a fictional row read as a
real one.

`admin.ts` also **deliberately does not read `ai_cap_alerts`**, because that table holds a
`cap_usd = 0.000000` row from a forced-zero-cap test. The honest spend panel is `readDailyCapUsd`
plus `aiUsageTotals`; no dishonest version was offered.

## Open assignments carried out of wave 1

- **`assertUserKeySecret` has no caller.** `packages/ai/src/user-key.ts` validates
  `AI_USER_KEY_SECRET` on **first use**, not at module load — deliberately, because `@pemby/ai` is
  imported by surfaces that have no business needing the secret and a module-load throw would take
  out a page that never touches a user key. The consequence is that a misconfigured deploy is
  discovered by **the first person who tries to connect their OpenRouter account**, not by the
  deploy. **Order B calls `assertUserKeySecret()` at web boot**, beside the other startup checks, so
  the failure lands on the deploy instead of on a user. Order D does the same in the worker only if
  the worker ends up decrypting a key; if it does not, it must not call it, because a service that
  asserts a secret it never uses is a service that cannot start without a variable it does not need.
- **`AI_USER_KEY_SECRET` goes in `.env.example`** by name, with an empty value and a comment
  (order D owns that file), and into Railway staging before order B's flow is exercised. 32 random
  bytes, base64: `openssl rand -base64 32`. It is **not** `NEXT_PUBLIC_*` and must never become one.
- **`apps/web/messages/en/tracker.json` must contain exactly this** (order C), or `check:reasons`
  fails once the namespace exists — which it is designed to do:
  ```json
  { "Tracker": { "columns": { "saved": "Saved", "applied": "Applied",
    "interview": "Interview", "offer": "Offer", "rejected": "Rejected" } } }
  ```
  The labels live in `packages/core/src/delivery/strings/en.ts` (the watched table) and the tracker
  module re-exports them. **Do not copy a label into the web file by hand from anywhere else** —
  copying a string out of a watched table is what takes it out of the checker's sight.
- **`.github/workflows/ci.yml` belongs to order D**, which adds `check:kernel` and `check:user-key`
  to the existing five steps, bringing the gate table to seven.

## Requirements added after the wave-1 blind reviews

Two blind reviewers went over wave 1. One stood up a real PostgreSQL 18 and executed the SQL; the
other drove real errors through the real OpenRouter provider. Between them they found nine defects
that every one of the seven green gates had missed. These are the rules that came out of it.

- **`apps/bot/**` now belongs to order C.** The original ownership map assigned it to no order at
  all — it appeared only in "must not touch" columns. That is how the tracker's `applied` column
  came to be unreachable from Telegram: `apps/bot/src/callbacks.ts:275` maps the "I applied" button
  to `matches.state` and writes no `applications` row, and no order was allowed to change it. Order C
  owns the Telegram side of the tracker as well as the web side.
- **The kit path must never fall back to Pemby's private key when a user's own key fails.**
  `ownKeyConnected` means *a row exists*, not *a usable key exists*: a row survives the key being
  revoked at OpenRouter, running out of credits, or becoming undecryptable after a secret rotation.
  `entitlementsFor` turns that row into `kitQuota: "unlimited"` unconditionally, so a silent fallback
  would hand a free user **unlimited kits on Pemby's money** — the exact inverse of the rule the
  module exists to enforce. This is also research 07's standing recommendation (§9: "Do **not** fall
  back to Pemby's key silently"). On a user-key failure, order A tells the person what happened and
  offers the choice; it does not spend Pemby's credits on their behalf.
- **The quota counts only the kits Pemby paid for.** `countKitsThisMonth` must exclude
  `key_class = 'user'`. Counting every row means a person who connects their own key, generates ten
  kits on their own credits and then disconnects is refused **all three** of the free kits Pemby owes
  them. An earlier draft of this contract said only "count `kits` rows per user per calendar month",
  which was the gap.
- **Flag weight is computed, not defaulted — order D owns the policy.** `flags.weight` defaults to 1
  and nothing computes anything else, while the eligibility engine downgrades a tier once red flag
  evidence sums to 2 (`packages/core/src/eligibility/engine/index.ts:1324`). `flagIsReal` excludes
  only flaggers who have a **demo** profile, so a user with no profile at all — signed up, never
  onboarded — counts in full. With open sign-up on staging that is **two throwaway accounts to
  downgrade a real company's tier.** PLAN section 6 already says what the answer is: "flags from pass
  holders and accurate past flaggers weigh more". A brand-new unonboarded account must weigh less
  than one, and two of them must not reach the threshold. This is the mass-flagging path the phase
  file names as an adversarial-review target; it is now a build requirement, not a review topic.
- **CI gets a Postgres service — order D.** Roughly 1,250 lines of hand-written SQL in
  `packages/db/src/queries/` currently ship with **zero runtime evidence**: no gate connects to a
  database, and `tsc` cannot parse the contents of a `sql` template. Order D adds a Postgres service
  to `.github/workflows/ci.yml` and a step that applies the migrations and exercises the query
  helpers, in the `check:*` style, not as a test suite. Three of the wave-1 defects — the `for update`
  over-locking, the quota race and the evidence double-insert — were found only because a reviewer
  ran the SQL by hand.
- **`kitQuotaVerdict` taking `Pick<Entitlements, "kitQuota">` is deliberate.** A reviewer flagged that
  a caller can satisfy it with an object literal. Accepted: requiring a whole `Entitlements` would
  force honest callers to construct fields they do not have, which is the defect this phase spent its
  effort removing. Recorded here so it is not re-raised.

## A pre-existing guard that has been failing, found while closing wave 1

`docs/conventions.md` requires this to find nothing before any commit:

```
git grep -nE 'sk-or-|BEGIN (RSA|OPENSSH)|password=' -- . ':!docs'
```

It has been matching `packages/ai/scripts/dry-zdr.ts:31` — a redaction regex,
`.replace(/sk-or-[A-Za-z0-9_-]+/g, "[key]")` — since before this phase. Nothing is leaking; the
match is the pattern, not a key. But it means **the repo's own pre-commit check has been returning a
hit for weeks and nobody noticed**, which is how a guard stops being read. On a public AGPL repo the
thing this guard catches — a real OpenRouter key — is unrecoverable once pushed.

Not fixed here, because it is outside every phase-09 order's ownership. The fix is either to anchor
the pattern so a redaction regex cannot match it, or to add a narrow allowlist for that one line —
whoever next owns `packages/ai/scripts/` should do it, and **no phase-09 order may add a second
match**. Wave 1's own violation (a placeholder key in a new check script) was corrected rather than
excused.

## Two constraints on order A, from the independent quota verification

An independent agent stood up its own PostgreSQL 18.6 and re-ran the kit-quota race against the real
`insertKitWithinQuota`, after first proving its harness went **red** against the broken
single-statement version (16 callers wrote 16 rows under a limit of 3). The fixed helper held at 4,
8 and 16 concurrent callers for one user, at 40 concurrent across 5 users, and across the month
boundary — repeated 8 times, **zero deadlocks over ~2,000 transactions**.

Two things that verification surfaced, which bind order A:

1. **Never wrap `insertKitWithinQuota` in an outer transaction that also performs the model call.**
   The reservation is a `FOR UPDATE` lock on the user's own `profiles` row. Held for the two fast
   statements it was designed for, it costs nothing and blocks nobody — measured at 12–53 ms for 16
   concurrent callers. Held for the length of a streamed Haiku generation, it blocks every other
   write to that person's profile for the duration, for every kit anyone generates. **Reserve, then
   generate, then record** — do not put an LLM call inside the lock.

2. **The helper is correct and nothing calls it.** `insertKitWithinQuota` is referenced only from
   `packages/db/src/index.ts`. Wave 1 ships a quota that is enforced *by the helper*, not yet *by the
   product*: any kit path that reaches `insertKit` directly, or that counts and inserts separately,
   bypasses everything proved above. Order A must route **every** path a free user can reach through
   `insertKitWithinQuota`, and must distinguish its three statuses on screen — `inserted`,
   `quota-exhausted` (offer the pass or the connect-your-key choice) and `no-profile` (send them to
   onboarding; telling an un-onboarded person their quota is spent sends them hunting a problem that
   does not exist).

## Deployment blocker recorded 2026-09-20

**Migration `0014` is not applied to staging, and `/settings` reads `user_ai_keys`.** The moment
wave 2 ships to staging without the migration, `/settings` answers 500 — measured through the public
proxy: `relation "user_ai_keys" does not exist`. The migration must be applied **before** the deploy
that carries order B, not after. This is the ordinary additive migration path, but the ordering is
not optional and no order applies it: the lead does.

## Things wave 2 taught, for the next contract

- **`apps/web/global.d.ts` is shared and was assigned to no order.** It types the i18n namespaces, so
  every order adding one must edit it or its own typecheck fails. Orders A, C and E all edited it
  concurrently and it merged cleanly — by luck, not design. **Assign it explicitly next time**, or
  split the namespace declarations per file. All three orders reported it independently, which is
  how a gap in an ownership map announces itself.

- **Five orders in one worktree is a real coordination hazard, and it is the lead's doing.** Two
  concrete instances: one order ran `pkill -f "next dev"` to stop its own server and would have
  killed another order's; and Next's per-directory dev lock meant an order could not start a server
  at all while another held `.next`, so it proved its change by running the SQL and the mapping
  directly and said so rather than claiming an end-to-end run it could not get. Both were disclosed
  voluntarily. **Next time: give each wave-2 order its own port and forbid pattern-matched process
  kills**, or run UI orders in separate worktrees.

- **Scratch files belong outside the repo, and `format:check` is what enforces it.** `pnpm format:check`
  goes red on an untracked scratch file anywhere in the tree, which is exactly how a probe script
  gets caught before it is committed. Do not add a broad `.prettierignore` escape for scratch paths.

## The admin gate's one deliberate omission

`isOwner` (`apps/web/lib/access/owner.ts:36`) checks: a session exists, it is **not** anonymous, it
has an email, and that email is on `OWNER_ALLOWLIST_EMAILS` — **unconditionally**, never behind
`ownerGateEnabled()`. Proven with the decisive control: one signed-in account, allowlist pointed at
someone else, got **200** on `/api/profile`, `/onboarding`, `/app` and `/profile` (all guarded by
`getProductAccess`) and **403** on all three admin routes.

`emailVerified` is deliberately **not** a condition, because verification is enforced upstream at
sign-up by `requireEmailVerification` (`apps/web/lib/auth/codes.ts:26`) and production's owner
account predates that step, so checking it here risks locking the owner out where it matters most.

**That makes the admin gate depend on a control in another file.** On any environment where sign-up
is open — staging is one — the thing stopping someone claiming the owner's email address *is* email
verification. If verification is ever disabled or bypassed on an open-sign-up environment, this gate
silently weakens to "whoever can type the right address". Anyone touching `requireEmailVerification`
needs to know that.

`OWNER_ALLOWLIST_EMAILS` is now set on staging `web`. `OWNER_GATE` remains unset there, so staging
product access stays open as intended and the allowlist affects `isOwner` alone.

## Resource isolation: a rule the lead should have set before wave 2

Five orders ran concurrently in one worktree on one machine with no port assignment, no naming
convention and no instruction to check whether a resource was already in use. Two collisions
followed, both disclosed voluntarily by the order that caused them:

- `pkill -f "next dev"` to stop one's own dev server, which would have killed another order's.
- A throwaway Postgres whose `pg_ctl start` **failed** (port already held). `psql` connected anyway,
  to a **different session's** database, which was then dropped and rebuilt. The signal was there and
  was misread: the first migration run failed with `type "ai_task" already exists` and reported 28
  tables — a populated database at the pre-`0014` schema.

**The rules, for any future wave:**

1. **`psql` connecting is not evidence that your server started. `pg_ctl`'s exit code is.** Check it.
   Then confirm ownership by reading `current_setting('data_directory')` back **off the server**,
   rather than trusting the port.
2. **An error that says "this already exists" is telling you whose it is.** Stop and look.
3. **Never pattern-kill a process** (`pkill -f`) on a shared machine. Kill by the PID you started.
4. Assign each concurrent order its own port range and a distinct data-directory name, in the order.
5. Scratch lives outside the repo. `pnpm format:check` catches a stray file anywhere in the tree,
   which is how a probe script gets caught before it is committed — do not add a `.prettierignore`
   escape for it.

A long scratchpad path is its own trap: a Unix socket path over 103 bytes makes `pg_ctl start` fail,
and the failure is silent if nobody reads the exit code.

## Residual risk after the wave-2 reviews, stated precisely

The per-company cap on location reports bounds **depth**, not **reach**, and the distinction matters
when writing the handoff. Measured with zero `matches` rows in the entire database:

- One account, five postings of one company: `rows=1 sum=1` → **no downgrade.** One account is worth
  exactly 1.00 against any one company, match or no match.
- Two accounts, any company chosen from outside: `rows=2 sum=2` → **the tier steps down.**

Before the `markApplied` hole, reaching a company at all required the matcher to have given that
person a match on one of its jobs, so an attacker could only press on companies Pemby chose to show
them. With any open job reachable, the two-account cost becomes **company-independent and
targetable**. The per-company cap is what stops it being *one* account; it does nothing about *which*
company, and it cannot — the target is chosen by the kit route, not by the tracker.

So the honest statement of the residual risk is **"two accounts, any company"**, not "mitigated".
Whoever closes the `markApplied` ownership check should re-measure this and update the sentence.
