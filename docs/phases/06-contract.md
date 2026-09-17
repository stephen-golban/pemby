# Phase 06 contract: CV drop, parse, teaser, claim

Written by the phase 06 lead. Every phase 06 work order builds against this file. If a builder finds
the contract wrong or unbuildable, it stops and reports rather than diverging.

Scope: staging only. Production keeps closed sign-up and the "not switched on" drop zone
(`APP_ENV=production` or a missing `CV_DROP_ENABLED=true` disables every route below with 404).

## Paths (the real layout; apps/web has no src/)

| Area | Owner order | Paths |
|---|---|---|
| Profile schema, enum mappers | W0 | `packages/core/src/profile/**` (exported from `@pemby/core`) |
| Schema + migrations 0006/0007 | W0 | `packages/db/src/schema/**`, `packages/db/drizzle/**` |
| Streaming AI primitive | B1 | `packages/ai/src/**` |
| Upload, text route, status route, bucket, Turnstile, rate limits | A | `apps/web/app/api/cv/**`, `apps/web/lib/cv/**`, `apps/web/lib/queue/**` |
| Extract + cleanup jobs | A | `apps/worker/src/cv/**` except `apps/worker/src/cv/parse/**`; A wires `index.ts` |
| Parse job + prompt | B2 | `apps/worker/src/cv/parse/**`; prompt in the local clone of `pemby-private` (never pushed by a worker) |
| Auth, verification, claim | D | `apps/web/lib/auth/**`, `apps/web/app/sign-in/**`, `apps/web/app/sign-up/**`, `apps/web/app/verify-email/**`, `apps/web/components/auth-form.tsx`, `apps/web/lib/email/**` |
| Teaser | E | `apps/web/lib/teaser/**`, `apps/web/app/api/teaser/**` |
| Drop UI, streaming profile, teaser UI | C1 | `apps/web/components/landing/drop-zone.tsx`, `apps/web/components/cv-drop/**`, `apps/web/components/profile/**`, `apps/web/messages/en/cv.json` |
| Onboarding, profile page | C2 | `apps/web/app/onboarding/**`, `apps/web/app/profile/**`, `apps/web/app/api/profile/**`, `apps/web/messages/en/onboarding.json` |

Shared files with a single owner: `apps/web/lib/access/paths.ts` (A adds `/api/cv`, `/api/teaser`,
`/verify-email` to public routes), `apps/web/global.d.ts` and `apps/web/i18n/request.ts` (C1),
`.env.example` (A; others send lines to add in their report), `apps/worker/src/index.ts` (A),
`apps/web/package.json` / `apps/worker/package.json` (A; B2 and D list deps in their report and the
lead adds them).

## Enums

Core spelling is canonical in TypeScript (`WAYS_OF_WORKING`, `SENIORITIES` in
`packages/core/src/ways-of-working`). The DB uses underscores and has no `staff`.
`packages/core/src/profile/enums.ts` exports `toDbWay`, `fromDbWay`, `toDbSeniority` (`staff` → `lead`),
`fromDbSeniority`. Nothing else converts by hand.

## ParsedProfile (`packages/core/src/profile/schema.ts`, zod 4)

All fields nullable or empty-array when the CV does not say; never invent.

```
fullName: string|null
titles: string[]                    // max 5, most recent first
seniority: Seniority|null           // core spelling
yearsExperience: number|null        // professional, excluding education
stack: string[]                     // max 30, canonical names ("TypeScript", "PostgreSQL")
domains: string[]                   // max 10 ("fintech", "e-commerce")
location: { city: string|null, country: string|null }   // country ISO 3166-1 alpha-2
timezoneGuess: string|null          // IANA, derived from location
languages: { name: string, level: EnglishLevel|null }[]  // level uses the DB english_level values a1..c2, native
englishLevel: EnglishLevel|null
links: { kind: "github"|"linkedin"|"portfolio"|"other", url: string }[]
roles: { title: string, company: string|null, startYear: number|null, endYear: number|null, kind: "job"|"internship"|"program"|"open-source"|"freelance" }[]  // max 10
education: { institution: string, degree: string|null, field: string|null, endYear: number|null }[]  // max 5
```

`ParsedProfilePartial = DeepPartial<ParsedProfile>` for streamed snapshots. Also export
`PARSED_PROFILE_VERSION` (string) and `defaultWaysFor(seniority)`: middle and up
`["b2b-contractor","eor-employee"]`; intern and junior add `"local","paid-program"` (PLAN D3, D11).

## Database (W0: migration 0006 enum values alone, 0007 the rest; both start with `SET lock_timeout = '5s';`)

- `cv_parse_status` enum gains: `uploaded`, `extracting`, `unreadable`, `parsing`, `queued`
  (existing `pending`, `parsed`, `failed` stay).
- `cv_files`: `bucket_key` becomes nullable (pasted text has no file); add `source` text not null default
  `'file'` (`file`|`text`), `parsed_partial` jsonb, `error_code` text, `queued_until` timestamptz,
  `stage_timings` jsonb (`{uploadedAt, extractedAt, parseStartedAt, firstPartialAt, parsedAt}` ISO strings).
  The `user_id` FK stays RESTRICT; deleters remove cv_files and the bucket object first.
- `rate_limits`: `key` text, `window_start` timestamptz, `count` int, PK (key, window_start).
- `pending_claims`: `anonymous_user_id` text PK FK user ON DELETE CASCADE, `new_user_id` text FK user
  ON DELETE CASCADE, `created_at`. Unique on `new_user_id`.

## Flow

1. Browser gets a Turnstile token, calls `authClient.signIn.anonymous()` if it has no session.
2. `POST /api/cv` multipart `{file, turnstileToken}`. Checks in order: feature on, session (anonymous or
   real), Content-Length ≤ 5 MB, Turnstile siteverify (`remoteip`), rate limits (IP: 5/hour, user: 3/day),
   magic bytes (`%PDF-` or DOCX zip), one active CV per anonymous user (a second upload replaces the
   first: delete old object and row). Uploads to bucket key `cv/<userId>/<cvId>` (no extension, no file
   name in the key), inserts `cv_files` (`status=uploaded`, `expires_at = now + CV_ANON_TTL_HOURS` for
   anonymous users, else null), sends `cv.extract {cvId}`. 201 `{cvId}`.
   Errors: 400 `cv_too_large|cv_bad_type|turnstile_failed`, 401 `unauthenticated`, 429 `rate_limited`,
   404 `not_found` (feature off).
3. `POST /api/cv/text` JSON `{text, turnstileToken}` (200–30,000 chars): same checks minus file; inserts with
   `source=text`, `extracted_text`, `status=parsing`, sends `cv.parse {cvId}`. 201 `{cvId}`.
4. Worker `cv.extract`: `status=extracting`; download; unpdf (PDF) or mammoth (DOCX), 20 s timeout; fewer than
   200 non-whitespace chars in total → `status=unreadable`, `error_code=scanned_or_empty`; else store
   `extracted_text` (NFC, collapse whitespace, cap 30,000 chars), `status=parsing`, send `cv.parse`.
5. Worker `cv.parse`: streams through `runStreamingStructuredTask` (B1) on task `cv-parse`, private key, ZDR.
   Writes `parsed_partial` at most every 700 ms. Success: `parsed`, `parse_model`, `parse_prompt_version`,
   `parsed_at`, `status=parsed`, then upserts `profiles` for that user, filling only null/empty columns
   (titles, seniority, years_experience, stack, residence_country, timezone, english_level,
   ways_of_working from `defaultWaysFor`). Cap reached: `status=queued`, `queued_until=retryAt`, resend with
   `startAfter`. Invalid output after retries: `status=failed`, `error_code=parse_failed`.
6. `GET /api/cv/:id` (owner of the row only, else 404): `{id, status, source, partial, parsed, errorCode,
   queuedUntil, timings}`. `partial` and `parsed` only for the owner. Client polls every 700 ms while
   status is `uploaded|extracting|parsing|queued`.
7. Teaser `GET /api/teaser` (session required; params optional overrides `country`, `ways`, `seniority`,
   `titles`): defaults from the session user's profile, falling back to the latest parsed CV.
   Response `{country, countryName, count, jobs: TeaserJob[≤3], basis}`; `TeaserJob = {id, title, company,
   location, url, reasonKey, reasonParams}`. Green tier only, open jobs verified live in the last 72 h (staging
   freshness is looser than the matcher's 24 h; E documents it), eligibility scope = country, way in ways.
   Country outside `TARGET_COUNTRIES` → `count: null` with `basis: "unsupported_country"`.
   Behind `TeaserSource` in `apps/web/lib/teaser/index.ts` so phase 07 swaps the implementation.
8. Sign-up: email + password with `requireEmailVerification: true` on staging. At sign-up, a
   `databaseHooks.user.create.after` (or equivalent) reads the anonymous session from the request and writes
   `pending_claims`. At `/verify-email` success (any device), the claim runs `claimAnonymousUser` and deletes
   the pending row. Sign-in to an existing verified account from an anonymous session keeps the existing
   `onLinkAccount` claim. Verification email through Resend from `hello@pemby.app` (D verifies the domain is
   usable; if not, reports rather than switching domains).
9. Worker `cv.cleanup`, cron every 10 min: anonymous users whose newest `cv_files.expires_at` (or, with no CV,
   `created_at + CV_ANON_TTL_HOURS`) has passed: delete bucket objects, cv_files, then the user (cascade
   removes sessions, profiles, pending claims). Logs counts only.

## Env (A adds to `.env.example`)

`CV_DROP_ENABLED`, `CV_ANON_TTL_HOURS` (default 24; staging proof lowers it), `BUCKET`, `ENDPOINT`,
`REGION`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY` (Railway bucket reference names),
`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`.

## Personal-data rules (every order)

- Never log CV text, parsed fields, file names, emails or bucket keys. Log ids, statuses, codes, counts, ms.
- Error objects from pdf/docx/AI libraries can contain text: log `err.name` and a code only.
- CV text goes only to the private key (ZDR enforced by `packages/ai`). No OpenRouter file plugins.
- Bucket objects are private; no presigned URLs are handed to browsers.
- No test suites. Proof is typecheck, lint, build and a real run.
