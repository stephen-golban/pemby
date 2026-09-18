# Phase 07 work-order contract

The phase file (`docs/phases/07-matching-brief.md`) assumed a greenfield. It is not one: phase 01
laid down most of the contracts this phase fills in. This file records what already existed, who
owns which paths, and the interfaces the parallel work orders code against. It is written for the
workers and for whoever reads the handoff later.

## What phase 01 already built (verified 2026-09-17)

Do not rebuild any of this.

| Thing | Where | State |
|---|---|---|
| `matches` table | `packages/db/src/schema/matching.ts:34` | Full: `kind` (`match`/`near_miss`), `blocker`, `gate_results`, `score`, `tier`, `reasons`, `gap`, `state`, `deliver_after`, per-channel `*_delivered_at`. Unique `(user_id, job_id)`. |
| `job_embeddings`, `profile_embeddings` | `packages/db/src/schema/jobs.ts:291`, `profiles.ts:175` | `halfvec(2048)` + HNSW `halfvec_cosine_ops`. **Never written to by anything.** |
| pgvector | `packages/db/drizzle/0000_enable_pgvector.sql` | Enabled. Column support is native `drizzle-orm`; there is no `pgvector` npm dependency. |
| Embedding model + dimensions | `packages/core/src/ai-contract/index.ts:72` | `qwen/qwen3-embedding-8b`, 2048-d. `halfvec` because pgvector's HNSW caps `vector` at 2000 dims. Changing either needs a migration and a full re-embed. |
| AI routing for embeddings | `packages/ai/src/routing.ts:71` | `job-embedding` and `profile-embedding` already route to the **private ZDR key**. `embeddingModelForTask()` exists; `validateRoutingTable` refuses any embedding model other than `EMBEDDING_MODEL`. |
| Scoring weights contract | `packages/core/src/private-config/schemas.ts:127` | `scoring/weights.json` is a **required** private-config file: five components summing to 1, plus `thresholds.match` and `thresholds.nearMissMin`. Weights are secret and never enter this repo. |
| Eligibility reason keys | `packages/core/src/eligibility/engine/reasons.ts` | 40 stable keys with `{country}`/`{region}`/`{places}`/`{engagement}`/`{requirement}` params, rendered at most 120 chars. |
| Programs calendar | `data/programs/programs.json`, `packages/core/src/programs/index.ts` | 5 programs, validated. **Zero importers.** |
| Type-only stubs left for this phase | `packages/core/src/{gates,scoring,near-miss,entitlements}` | 15–20 lines each, explicitly labelled "phase 07 fills this". |

## Defects found before any code was written

1. `packages/db/src/seed.ts:645` stores a **job title** in `job_enrichment.role_family` instead of a
   `RoleFamily` slug, and never sets `jobs.role_family`. Demo data cannot be role-gated as it stands.
2. Core's `HARD_GATES` stub and the Postgres `match_gate` enum disagree. **The database enum wins** —
   it separates `salary_missing` from `salary`, which are two different near-miss buckets with two
   different one-tap fixes.
3. `matches` had nowhere to store `MatchScore.components`.
4. `qwen/qwen3-embedding-8b` is missing from `PRICE_PER_MILLION` (`packages/ai/src/usage.ts:77`), so
   it would be billed at the unknown-model rate of $1/$5 per million and eat the daily cap.
5. `upcomingWindows()` returns **nothing** today: every future window in `programs.json` has
   `opens: null` and only a recurrence sentence. A junior's "next step" would be an empty list.
6. `CV_PARSE_DAILY_BUDGET_USD` is read in code (`apps/worker/src/cv/parse/parse-cv.ts:62`) but is
   missing from `.env.example`.

## The green-tier question, settled with numbers

Phase 06 handed this phase an open decision: green tier is nearly empty, so either the rules change
or what free users see changes. Measured against staging on 2026-09-17 (2,924 enriched real jobs,
open, non-duplicate, verified live within 24 h, not money-asking):

| Country | green | green+yellow | | Country | green | green+yellow |
|---|---:|---:|---|---|---:|---:|
| RS | 7 | 80 | | BA | 1 | 71 |
| GE | 6 | 71 | | **MD** | **1** | **67** |
| AL | 2 | 69 | | MK | 1 | 67 |
| AM | 2 | 53 | | XK | 0 | 68 |
| UA | 1 | 73 | | ME | 0 | 68 |

Three findings that redirected the work:

1. **Moldova is not an outlier.** The whole 10-country target market holds 21 green (job, country)
   pairs, from three employers: Tether, SearchApi, ClickUp. A fix for one country fixes all of them.
2. **Neither suspected rule is responsible.** `COMPANY_EVIDENCE_MAX_TIER` accounts for **0** Moldova
   rows — 293 of 311 companies have never been evidence-checked and no evidence row covers any
   target country, so raising the cap today would change nothing. The two-keys-for-green gate also
   accounts for **0** Moldova rows; disabling it entirely would add 0 Moldova jobs and 2 Serbian
   ones. Tuning either would have been wasted work.
3. Moldova's 66 yellows are two buckets and a tail: 30 "worldwide, but not how people are engaged"
   (26 of them one employer, Supabase), 29 "names Europe/EMEA, which may include Moldova", 7 others.

**Owner's decision (2026-09-17): amend D13 so free users can opt into yellow.** The engine's tier
rules are unchanged — loosening them would have bought 30–93 jobs by spending the eligibility
precision that is positioning mechanism #1, and a false green sends someone to a job that cannot
hire them. The 66 surface through the near-miss mechanism D7 already specifies, whose own worked
example is "include yellow", with a one-tap fix. Passes now differentiate on delivery speed, kit
quota and the extension.

Also approved: enrich the remaining ~4,469 unenriched open staging jobs (~$1.60 at the measured
$0.36/1,000). That is expected to add roughly 100 more Moldova yellows at the observed 2.26% rate,
and almost no greens.

## The scoring model, and why it nearly shipped broken

The first live matcher run wrote matches scoring exactly **100** with a single reason bullet. The
stored `score_components` showed only one component with signal: `timezoneOverlap = 1.0`. Two
compounding defects:

1. **Absence was scored as perfect fit.** A post stating *no* timezone requirement produced a full
   working day of overlap, clamping to 1.0. "This post does not constrain your timezone" — no
   information at all — was the strongest possible signal.
2. **Renormalising onto one signal fabricated certainty.** Spreading absent components' weight over
   the survivors is right in principle (a job with no embedding must not be scored as if similarity
   were 0), but when one component survives it takes the entire weight, so one perfect sub-signal
   became 100/100. With the bar at 80, a post saying almost nothing outranked one saying a great deal.

The fix adds an **evidence ceiling**: a job can only score as high as the evidence behind it allows,
and one signal alone can never make a match (`EVIDENCE_FLOOR`, `MIN_EVIDENCE_COMPONENTS` in
`packages/core/src/scoring/score.ts`). A ceiling, not a multiplier — a multiplier scored an unknown
component as a bad one, dropping a genuinely strong job from 85 to 58.

That produced a second, sharper finding: with `domain` null on 100% of pairs and `timezoneOverlap`
on ~98%, evidence topped out at 0.5 and the ceiling landed on **exactly the match threshold**. Zero
matches was arithmetic, not data. The owner's correction (2026-09-17) distinguishes **not applicable**
(absence on the job side — nothing could be known) from **missing** (absence on the user side or in
our pipeline — we could have known and did not), and excludes only the former from the denominator.

**Root cause behind `domain`, and it belongs to phase 06, not this phase: 27 of 28 parsed CVs on
staging contain no domains at all.** The CV parser is not extracting them. This is a parse-quality
gap, not a coverage gap — more CV uploads will not fix it, and it is what keeps the third score
component dark and the third reason bullet unreachable. It needs a `cv-parse` prompt change in the
private config repo.

## Open findings for the blind adversarial review

1. **Freshness contradicts itself on screen.** Match cards render "Last seen live 28h ago; the bar is
   24h". PLAN D6 makes 24h a hard gate and section 4.5 says a dead job is pulled from Briefs, but a
   match row simply ages past the bar between matcher runs and keeps displaying, stating its own
   violation. Either the Brief read filters on freshness, or the copy is wrong.
2. **A tolerated experience shortfall is currently invisible, which defeats its own purpose.** The
   years gate now lets a shortfall of up to `YEARS_SHORTFALL_TOLERANCE_YEARS` pass, and records
   `years-tolerated` ("The post asks 5 years; your CV shows 4.") in `GateResult.notes`. But
   `apps/web/components/brief/reasons.ts` renders only three gate keys (`freshness-*`), and
   `pickGap` in `score.ts` emits `years-short` **only** when the shortfall fails — so a tolerated
   shortfall produces no note on screen and no gap either. The job is shown with the stretch
   silently hidden. Research 12 §5 asks for the opposite in the same breath as the tolerance:
   *"Label the gap honestly rather than hiding the job."* The likely fix is for `pickGap` to emit the
   tolerated shortfall as the job's one honest gap, since that is exactly what a gap is for.
3. **White tier may be visible in near-miss groups.** The one-tap fix counts
   `filter (where m.tier = 'yellow')`, but the group's example list carries no tier filter, so the
   group header and the fix disagree ("2 can't be confirmed" / "1 looks likely"). D2 as amended says
   white and red never show. Determine whether a white or red job can reach a near-miss group through
   the real matcher, not only through seeded demo rows.

## Ownership map

No two concurrent work orders write the same file.

| Order | Owns | Must not touch |
|---|---|---|
| **1 — database** | `packages/db/src/schema/**`, `packages/db/drizzle/**`, `packages/db/src/queries/**`, `packages/db/src/index.ts`, `packages/db/src/seed.ts` | everything else |
| **2 — core logic** | `packages/core/src/{gates,scoring,near-miss,entitlements,roles,programs,matching}/**`, `packages/core/src/index.ts` | `packages/core/src/eligibility/**`, `packages/db/**`, `apps/**`, `packages/ai/**` |
| **3 — embeddings** | `packages/ai/src/**`, `apps/worker/src/embed/**` | worker wiring files (order 4 owns them) |
| **4 — match worker** | `apps/worker/src/match/**`, `apps/worker/src/scripts/**`, `apps/worker/src/index.ts`, `apps/worker/package.json`, `.env.example` | `apps/worker/src/embed/**` |
| **5 — Brief UI** | `apps/web/app/brief/**`, `apps/web/app/api/brief/**`, `apps/web/components/brief/**`, `apps/web/lib/teaser/**`, `apps/web/messages/en/**`, `apps/web/global.d.ts`, and the two link insertion points below | `packages/**`, `apps/worker/**` |

Order 5's two link insertions — the reason this phase exists at all, in the owner's words at the
phase 06 checkpoint ("feels like the whole app ends on users profile and that's it"):

- `apps/web/app/profile/profile-client.tsx:85` — the right rail, beside the match count line.
- `apps/web/app/onboarding/onboarding-flow.tsx:204` — the finish screen's primary action.

## Cross-order interfaces

Order 3 delivers `apps/worker/src/embed/index.ts` as a barrel exporting `readEmbedEnv`,
`createEmbedQueues`, `startEmbedWorkers` and `scheduleEmbedSweep`, matching the shape of
`apps/worker/src/enrich/index.ts`. Order 4 wires exactly those four names into
`apps/worker/src/index.ts` without reading order 3's internals.

## Standing rules for every order

- **No test suites** (PLAN D24). Proof is typecheck, lint, build and a real run.
- Public AGPL-3.0 repo: no secrets, prompts, scoring weights or source lists in any committed file.
- PLAN D16 wording in every user-facing string, including reason and gap templates.
- Personal data (CVs, profiles, embeddings) only through the private ZDR key, never logged.
- Migrations are additive and start with `SET lock_timeout = '5s';`. Enum value additions go in their
  own migration file, alone, because the Drizzle migrator runs all pending migrations in one
  transaction.
- Staging only. Never `railway up`, never `gh auth switch`, never touch production, never reseed.
- Workers do not commit. The lead reviews every diff and the owner approves every commit.
