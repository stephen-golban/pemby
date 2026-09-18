# Phase 07 handoff: matching, near misses and the Brief

Written 2026-09-17, closed out 2026-09-18. **Built, reviewed and running on staging.
Not yet checkpointed with the owner** — that is the first thing phase 08 should not assume happened.
Production is untouched.

## What shipped (all on `main`, CI green)

| Commit | Unit |
|---|---|
| `3956020` | `packages/core/src/{gates,scoring,near-miss,entitlements,matching,roles,programs}` — hard gates, the evidence-ceiling scorer, near-miss grouping, the entitlements interface, one seniority ladder |
| `9c0389f` | `packages/db` — migrations 0008/0009/0010, `queries/matching.ts`, `retireStaleMatches`, seed fixes |
| `ef5ae7f` | `packages/ai/src/embeddings.ts` — `runEmbeddingTask` on the private ZDR key, embedding price |
| `3cedd43` | `apps/worker/src/{embed,match}`, scripts, wiring, `.env.example` |
| `dc494ec` | `apps/web` — the Brief, its API, the teaser rewrite, the two links |

The work-order contract, the ownership map and the full reasoning behind the scoring model are in
`docs/phases/07-contract.md`. This file records what shipped, what changed in the plan, and what the
next phase inherits.

## Plan amendments the owner approved (2026-09-17)

| Decision | Change | Why |
|---|---|---|
| **D13** | Yellow opt-in moved from Pass to **Free**. Passes now differentiate on delivery speed, kit quota and the extension only. | Measured on 2,924 enriched real staging jobs, the whole 10-country target market held **21** green (job, country) pairs from three employers — Moldova 1, Serbia 7, Georgia 6, Montenegro and Kosovo 0. Yellow-as-a-paywall was gating an empty free product, not a premium one. |
| **D2** | White and red never show (was "red never shows"). | Follows from the above; yellow is the opt-in boundary, white is not. |

The engine's tier rules were **not** loosened. Options to promote `worldwide` or `region-includes` to
green were rejected: they would have bought 30–93 jobs by spending the eligibility precision that is
positioning mechanism #1, and a false green sends someone to a job that cannot hire them.

## What the phase discovered that phase 06 had wrong

Phase 06 handed over "green tier is nearly empty, decide whether the rules change". Measured:

1. **Moldova is not an outlier** — every target country has 0–7 greens.
2. **Both suspected causes were innocent.** `COMPANY_EVIDENCE_MAX_TIER` accounts for **0** Moldova
   rows (293 of 311 companies have never been evidence-checked and no evidence row covers a target
   country). The two-keys-for-green gate also accounts for **0**. Tuning either would have been
   wasted work.
3. **60% of supply was unenriched** (4,469 of 7,393 open real jobs). Enriching it is approved and
   running; it moved Moldova from 1 green / 66 yellow to 6 / 101 partway through, at a higher green
   rate than the original pool.

## The defect that matters most for whoever reads this next

**The scorer was certifying jobs at 100/100 on a fabricated signal.** A post stating *no* timezone
requirement produced a full working day of overlap, clamping to 1.0; renormalisation then handed that
single component the entire weight. A post saying almost nothing outranked one saying a great deal,
and with the bar at 80 those became delivered matches.

Fixing it exposed the layer beneath: with `domain` null on ~100% of pairs and `timezoneOverlap`
not-applicable on ~98%, the evidence ceiling landed on **exactly** the match threshold, so zero
matches was arithmetic rather than data. And beneath *that*: the matcher scored jobs **before they
were embedded** and never rescored them, so most of the corpus was permanently pinned one point under
the bar.

None of this was visible from reading the diffs. Two blind adversarial reviewers found it.

## Known issues and open items

- **The CV parser extracts no domains.** 27 of 28 parsed CVs on staging have an empty `domains`
  array. This keeps a third score component dark and makes PLAN D6's third reason bullet structurally
  unreachable. It needs a `cv-parse` prompt change in `stephen-golban/pemby-private` and a new tag —
  **owner approval required before any prompt push.** This is a phase 06 parse-quality gap, not a
  coverage gap; more CV uploads will not fix it.
- **`MIN_EVIDENCE_COMPONENTS` is 2.** A post listing one matching technology plus a decent embedding
  similarity scores ~89/100 on two components. At 3, a match would effectively require the post to
  name domains *and* the CV to have yielded some — so this and the CV-domain fix are one decision.
- **No currency-rate source exists.** `GateInput.currencyRates` is honoured but nothing supplies it,
  so the salary gate now refuses (rather than silently passes) any cross-currency comparison.
  Measured blast radius: 7 of 32 profiles set a floor, and 86% of salaried jobs are USD, so roughly
  5% of jobs become salary near misses. Recommended fix: a rates table in private config, loaded
  beside `loadScoringWeights`. Exchange rates are public data, but the loader keeps it out of the
  public repo cleanly.
- **A saved job that ages out disappears from the Brief.** The near-miss read filters to
  `state = 'new'` (correct, avoids duplicates) and a stale match is re-homed into the `freshness`
  near-miss group — so a row the user deliberately saved leaves the match list and is excluded from
  near misses. Defect in the interaction of two individually-correct rules.
- **`selectMatchCandidateJobs` has no embedding filter**, so `match.profile` can score unembedded
  jobs. Left deliberately: filtering there would shrink near-miss counts rather than delay them. 12%
  of enriched open jobs are unembedded.
- **`held-note.tsx` intermittently triggers TS2589/TS2590** ("type instantiation is excessively
  deep") under parallel `tsc` runs. next-intl's typed-messages union is near the compiler's budget.
  It will flap in CI.
- **Migration 0008's SQL comment describes `scoring_nudges` as "-1..1"**, which is wrong — they are
  score points bounded by `NUDGE_LIMITS` (±15 per key, ±25 total). The schema comment in
  `packages/db/src/schema/profiles.ts` is correct and names `NUDGE_LIMITS` as the source of truth.
- The daily AI cap on staging was fully spent (`$1.50`) during this phase; `AI_DAILY_CAP_USD` is at
  **1.5** and should return to **1** once the enrichment backfill finishes.
- Two `match.profile` jobs sit `created` on staging from a verification run; the deploy drains them
  into a harmless re-match of one profile.
- 24h worker stability remains unproven (carried from phase 05).

## Notes for phase 08 (delivery)

- `deliverAfter` is computed from the job's `first_seen_at`, not from now, and `upsertMatches` uses
  `coalesce` so a re-run cannot push a pending delivery out. The Brief now withholds undelivered
  matches entirely — no title, company or URL — so the web channel honours D13 like any other.
- Reason rendering is **keys plus params**, not English: `job_eligibility.reason_key`/`reason_params`,
  `matches.reason_keys`/`reason_params`/`gap_key`/`gap_params`. `renderGateReason` and
  `renderScoreReason` in `@pemby/core` are the non-React renderers Telegram and email should use.
  The English in core and in `apps/web/messages/en/brief.json` must stay **byte-identical** — they are
  compared programmatically, and ICU plurals are deliberately excluded because the core renderer
  cannot produce them. Strings are phrased so grammatical number never arises; keep it that way.
- Entitlements is the only module that decides instant vs delayed, kit quota and yellow opt-in
  (`packages/core/src/entitlements/`). Phase 10 flips one line to read the real `passes` row.
