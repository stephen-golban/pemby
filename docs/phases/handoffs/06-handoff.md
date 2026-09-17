# Phase 06 handoff: CV drop, parsing, signup, onboarding

Written 2026-09-17. Built, reviewed, running on **staging only**, and checkpointed by the owner with
their own CV: drop, sign-up, email verification, the claim, onboarding, profile and account deletion
all ran on deployed staging. Production is unchanged: the drop zone is the phase 03 stand-in,
sign-up stays closed, `PRIVATE_CONFIG_REF=config-v0.3.0`.
**Remaining for phase 07: the green-tier supply question and the dead end after onboarding** (both
below). Nothing in phase 06 is left half-built.

## What shipped (all on `main`, CI green)

| Commit | Unit |
|---|---|
| `13d04db` | `packages/core/src/profile/**` (ParsedProfile zod schema, `normalizeParsedProfile`, enum mappers, `defaultWaysFor`); migrations 0006 (cv_parse_status values) and 0007 (cv_files columns, `rate_limits`, `pending_claims`) |
| `da11ad7` | `runStreamingStructuredTask` in `packages/ai/src/structured.ts` |
| `e00e900` | `apps/web/app/api/cv/**`, `apps/web/lib/cv/**`, `apps/web/lib/queue/**`, `apps/worker/src/cv/**` (extract, child process, inflate guard, cleanup) |
| `734791f` | `apps/worker/src/cv/parse/**`: parse job, streamed partials, profile pre-fill, CV-parse budget |
| `2744fd4` | Email verification, pending claim settled on verify, password reset, takeover fixes |
| `b0332aa` | `apps/web/lib/teaser/**`, `GET /api/teaser` |
| `b5417a2` | CV drop UI, streaming profile, teaser UI (via /impeccable; build path now code-first) |
| `ea769fa` | `/onboarding` three steps, `/profile` with strength, export, delete |
| `b0ecd62` | `docs/phases/06-contract.md` (the work-order contract) |
| `a218221` | Finish-review fixes across both UI rounds |
| `4f488de` | Stale-prompt guard, display name filled from the CV |

Private config `stephen-golban/pemby-private`: tag **`config-v0.4.0`** (`c132f5a`) added prompt
`cv-parse` 0.2.0 and `routing.json` (cv-parse: temperature 0, maxOutputTokens 2500); tag
**`config-v0.4.1`** (`6118351`) is prompt 0.3.0 with the years-of-experience rule. Staging web and
worker are pinned to `config-v0.4.1`; **production stays on `config-v0.3.0`** and has never loaded
either.

## Definition of done

| Item | Status |
|---|---|
| Drop to teaser under ~15 s | **12.2 s median** (production build, 3 runs). Owner's own run on deployed staging: upload→parsed **3.9 s** (PDF) and **4.0 s** (DOCX) |
| Profile accurate enough | **Owner accepted it** at the checkpoint: "otherwise everything is good", with one defect — their CV (~7 years) parsed as 5.5. Fixed in prompt 0.3.0 (`config-v0.4.1`): a stated total wins, and with no total the span from first to last role replaces summing durations, which lost the gaps. Re-verified on the owner's own CV **in memory only** (no row, no bucket object, nothing written): 5.5 → **7.5**. Caveat: a synthetic gap case still returns 8.5 where the span is 10.5, so the span rule is not reliable on every CV with `gemini-2.5-flash-lite`; the junior fixture moved 1 → 1.5 years |
| Signup claims the anonymous data | **Proved by the owner's own run**: fresh sign-up, email verified, CV claimed (`profileFilled=9`), then a second upload filled nothing because the profile was already set. Also verified in tests for same browser, fresh browser and the attacker case |
| Unclaimed upload gone after cleanup | Verified: seeded expired upload → user, row and bucket object all gone |
| Account deletion | **Proved by the owner's own run**: after deleting the account, no `cv_files` row, no user and no pending claim remain; the `ai_usage` rows survive with `user_id` null, as designed |
| No CV text in logs | **Proved on a real upload through deployed web**: web logs `cv upload: cv=<uuid> type=pdf bytes=210757`, worker logs ids, counts and ms only. Across runtime, build and HTTP logs: 0 emails, 0 filenames, 0 lines over 200 chars, 0 base64-like runs. Sentry and PostHog are not installed |
| Finish reviewer verdict | `fix` → 8 material fixes applied (`a218221`) |
| Screenshots on the progress page | Done, on the **new** progress page (see below) |

## Deviations from the phase file, and why

1. **Paths.** The phase file assumed `apps/web/src/**`; the app has no `src/`. The contract
   (`docs/phases/06-contract.md`) carries the real ownership map.
2. **Claim on verification, not at sign-up.** With `requireEmailVerification`, Better Auth sets no
   session at sign-up, so its `onLinkAccount` never runs. `pending_claims` records the link at
   sign-up and `databaseHooks.session.create.after` settles it when the verified session is created.
3. **Streaming is worker-side.** The worker streams partials into `cv_files.parsed_partial` and the
   browser polls every 700 ms; the web request never holds a model call.
4. **Extraction runs in a child process**, not a worker thread: `maxOldGenerationSizeMb` caps only the
   V8 heap, and pdf.js allocates outside it (a 1.5 MB PDF reached 4.7 GB).
5. **No zod in `apps/web`** (not a dependency): the teaser and profile routes hand-validate.
6. **Progress page moved.** The old artifact belongs to another Claude account and is unreachable;
   the new one is https://claude.ai/artifact/FEknxetV7BiA58y11fBqDJ (`docs/PROGRESS.md` updated).

## New env vars and services

- Web: `CV_DROP_ENABLED`, `NEXT_PUBLIC_CV_DROP_ENABLED` (build-time; decides which drop zone renders,
  keeps `/` static in production), `CV_ANON_TTL_HOURS` (**the TTL that counts for uploads — stamped by
  web at upload time**), `CV_ANON_GLOBAL_PER_HOUR`, `TURNSTILE_ALLOWED_HOSTNAMES` (required outside
  development, else the routes 503), `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`,
  `RESEND_API_KEY`, `EMAIL_FROM`, `TEASER_INCLUDE_DEMO` (staging only), bucket vars (`BUCKET`,
  `ENDPOINT`, `REGION`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`).
- Worker: the same bucket vars, `CV_DROP_ENABLED`, `CV_ANON_TTL_HOURS` (only affects anonymous users
  with **no** CV), `CV_PARSE_DAILY_BUDGET_USD` (default 1.00). Staging `AI_DAILY_CAP_USD` raised to
  1.5 for the checkpoint — **consider returning it to 1**.
- Staging bucket `pemby-cvs` is now wired to web and worker. **Production has no bucket**; phase 11
  (or whenever the drop opens there) must create one.
- Queues: `cv.extract`, `cv.parse`, `cv.cleanup` (exclusive, cron `*/10 * * * *`).
- Dependencies: `@aws-sdk/client-s3` 3.1133.0, `unpdf` 1.8.1, `mammoth` 1.12.3, `pg-boss` 12.32.0 (web),
  `@marsidev/react-turnstile` 1.6.1.

## Security review (blind, adversarial) and what it changed

Two high findings, four medium, four low; all fixed and re-proved:
- **PDF/DOCX decompression bomb** crashed the worker (4.7 GB RSS). Now: an inflate pre-pass with a
  30 MB budget, extraction in a child process killed at 400 MB, concurrency 1. Measured peak after
  the fix: 479 MB; real CVs unaffected.
- **Account takeover by e-mail**: a stranger could sign up with someone's address, and once that
  person verified, sign in with the password they set. Now: re-sign-up replaces an unverified
  account, verification revokes earlier sessions, and password reset exists.
- CV text could reach `pgboss.job.output` through drizzle's error message (which includes query
  params). Handlers now rethrow `new Error(name)`, and C0 controls are stripped.
- Turnstile checks `hostname` and `action`; `clientIp` reads `X-Real-IP` only — **verified on staging
  that Railway replaces a client-supplied value**, so the per-IP limit holds.
- CV parsing has its own daily budget so one visitor cannot exhaust the shared $3 cap.
- Signing in from an anonymous session claims its data only within 60 minutes (shared computers).

## Known issues

- **Green tier is nearly empty.** 2,929 enriched real staging jobs give Moldova **1** green (Georgia 6,
  Ukraine 1, Serbia 7); 1,893 freshly enriched jobs added **zero**. Free users see green only (D2, D13),
  so on this data a free user sees almost nothing while ~66 Moldova jobs sit at yellow. **Phase 07 must
  decide**: tune the rules, or revisit what free users see. More enrichment will not help.
- **The product ends on the profile page.** Owner's words at the phase 06 checkpoint, after running the
  real flow: "i don't see any jobs or any hints to where i can see the jobs, feels like the whole app
  ends on users profile and that's it". Jobs appear only in the landing teaser, before sign-up. The
  owner chose to leave this to phase 07 rather than widen phase 06 — so **phase 07 must link the Brief
  from both `/profile` and the onboarding finish screen**, not just build it.
- `local` and `paid_program` have no eligibility rules yet, so a junior's count ignores them.
- The daily-cap alert shares one dedupe row, so a CV-budget alert and a global-cap alert cannot both
  reach the owner on the same day.
- An anonymous CV is deleted at 24 h even if a pending claim exists; verifying later loses the CV.
- Dark theme gives the CV panel little separation from the page (tokens, not layout).
- The landing hero (phase 03) still says Pemby "tells you when one appears"; delivery ships in phase 08.
- 24 h worker stability remains unproven (carried from phase 05).
- 6 `failed` and 2 `unreadable` `cv_files` rows on staging are test residue from before the prompt fix.

## Notes for phase 07

- Swap `getTeaserSource()` in `apps/web/lib/teaser/index.ts`; nothing else in the UI needs to change.
  `TEASER_FRESHNESS_HOURS` is 72 h (looser than the matcher's 24 h) and `TEASER_INCLUDE_DEMO` is on
  for staging — both should tighten.
- `job_eligibility` stores only the rendered English reason; the teaser recovers the key by matching
  text (`apps/web/lib/teaser/reason.ts`). Store `reason_key` and `reason_params` and delete that file.
- The role-family adjacency table in `apps/web/lib/teaser/roles.ts` belongs in `packages/core/src/roles`.
- `employment_type` has no core mapper; one lives locally in `apps/web/app/api/profile/_lib/db.ts`.
- The demo seed puts titles in `job_enrichment.role_family`, which breaks role gating on demo data.
- Profile pre-fill only ever fills empty columns, so the matcher can trust user edits.
