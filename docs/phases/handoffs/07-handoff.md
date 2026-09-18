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
| `a2623e9`, `78c6fb8`, `3b072df` | handoff corrections: an overstated parity guarantee, an undercount of the reason tables, and the two defects above |
| `6aebd58` | migration 0011 and `apps/worker/src/embed/**` — `embed.sweep` converges instead of livelocking |

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

## Defects phase 07 shipped and something else caught

Recorded here with provenance, because both were invisible to a reading of the code and both are
the same shape: correct in isolation, wrong in composition.

- **`entitlementsFor` was called with an incomplete question.** `apps/worker/src/match/map.ts` called
  it without `testPassHolders`, and `packages/core/src/entitlements/index.ts` computes pass-holder
  status from exactly that field — so the check was vacuously false for everyone, every user
  resolved to free tier, and every `deliver_after` became `first_seen_at + 24h`. Instant delivery,
  one of the three things a pass buys under D13, did not exist. Worse second-order effect: the
  dispatcher *does* pass the allowlist, so it then judges the resulting 48-hour-old message "not
  late" and sends it without the D13 disclosure. Found and fixed by phase 08 (shared
  `readTestPassHolders` parser called by both `deliver/env.ts` and `match/env.ts`).
  **The durable lesson, which is phase 08's phrasing and better than mine: an optional field on a
  decision function is a default nobody chose.** PLAN section 5 makes that module the single place
  these decisions are made, which is precisely what made a caller quietly under-feeding it
  invisible — everyone correctly believed the decision lived somewhere trustworthy. The defect was
  in neither the module nor really either caller; it was that the type permitted an incomplete
  question. The durable fix is a required field; the shared parser is the cheap version.

- **`embed.sweep` could not work through a backlog.** `embedJob` returned `unchanged` without
  touching `job_embeddings.updated_at`, so content-identical rows stayed candidates for ever. On
  staging 3,285 such rows sat permanently in the ordering and the sweep completed ~5,000 runs with
  zero model calls. Because the ordering is `first_seen_at desc`, newly ingested jobs at the head
  *were* embedded — so this starved a backlog rather than stopping the pipeline outright, which is
  why it looked healthy. It matters because the matcher refuses to score a job with no vector, so a
  starved embedder presents as "the matcher finds nothing" and sends you debugging the wrong
  service. The ~3,900-job gap was only closed because someone ran `embed:once` by hand.

## Known issues and open items

- **An unembeddable job is now retried every sweep instead of being buried.** A job hitting
  `AiEmbeddingInvalidError` is logged and returned without writing anything, so it stays a
  candidate. That was invisible while 3,285 phantom rows crowded the queue; now that the sweep
  converges it is reached every 15 minutes. **Currently theoretical** — staging has zero
  `embed.job` failures across 5,132 completions — and if one appeared it would cost about
  `$0.0000084 x 96 sweeps` = **$0.0008 per job per day**, bounded by `EMBED_DAILY_BUDGET_USD`
  (0.25). Not escalated to the owner on those numbers. The durable fix is to record the failed
  attempt so it backs off, which is the same "record what you did" shape as the livelock above.

- **1,946 jobs have a completed `match.job` but no `matches` row**, so `last_matched_at` stays null
  for ever and the sweep's ordering sorts nulls first — they permanently head the queue and are
  re-fanned once a day. Harmless at current volume (28,800/day capacity against ~7,300 jobs) and
  the module's docstring acknowledges it. Fixing it needs a "last fan-out attempt" record, which
  touches the `matches` write path. Phase 08 reviewed it and assigned it to **phase 09** rather
  than bolting it onto a phase already at its commit gate.

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
  The English in core and in `apps/web/messages/en/brief.json` must stay **byte-identical**.
  **Nothing enforces this.** It was verified by hand during phase 07 — the tables were parsed and
  diffed at review time, 34/34 gate keys and 13/13 score keys with zero drift — but no checker
  exists in the repo and CI runs only typecheck, lint and build. The parity is held by a code
  comment and by whoever remembers. An earlier draft of this handoff said the two were "compared
  programmatically", which overstated an ad-hoc review step as an enforced guarantee; phase 08
  caught that and is adding the real checker and wiring it into CI. Until it lands, treat any edit
  to any of these tables as unguarded — and note there are **four**, not two, with names that do
  not all correspond:

  | core table | web namespace | keys |
  |---|---|---|
  | `gates/reasons.ts` `GATE_REASONS` | `Brief.gateReasons` | 34 |
  | `scoring/reasons.ts` `SCORE_REASONS` | `Brief.scoreReasons` | 13 |
  | `eligibility/engine/reasons.ts` `ENGINE_REASONS` | `Brief.**eligibility**Reasons` | 40 |
  | `programs/next-steps.ts` `PROGRAM_REASONS` | `Brief.programReasons` | 13 |

  All four were clean on `main` at `a2623e9`, measured in both directions. The mismatched
  `ENGINE_REASONS` → `eligibilityReasons` pair is exactly the mapping a checker-less edit gets
  wrong. A one-sided key matters as much as a differing value.
  ICU plurals are deliberately excluded because the core renderer cannot produce them, so the two
  renderers would drift in a way no string diff would catch. Strings are phrased so grammatical
  number never arises; keep it that way.
- Entitlements is the only module that decides instant vs delayed, kit quota and yellow opt-in
  (`packages/core/src/entitlements/`). Phase 10 flips one line to read the real `passes` row.
