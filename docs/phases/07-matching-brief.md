# Phase 07: matching, near misses and the Brief

Read `docs/phases/_COMMON.md` first.

## Read first

- `docs/PLAN.md` D2, D6, D7, D10, D11, D13, D26, sections 4, 5 and 6
- `PRODUCT.md`, `DESIGN.md`, `docs/phases/handoffs/05-handoff.md` and `06-handoff.md`
- `docs/research/01-job-seeker-pain-points.md` (top 7 only)
- `docs/research/12-juniors-and-internships.md` (product implications only)

## Goal

Pemby decides, for every user, which jobs clear the bar, explains why, and shows it in the Brief, a
calm page that is not a feed. When nothing clears the bar, the Brief says so and shows near misses with
one-tap fixes.

## In scope

1. **Embeddings.** `qwen/qwen3-embedding-8b` (or the phase 05 routing) for jobs and profiles, all on
   the private key with ZDR, so one model and provider set is used and personal data never leaves ZDR.
   Changing the embedding model means re-embedding everything. Store vectors with pgvector, enabled in
   phase 01.
2. **Matcher in `packages/core`.** Hard gates from D6, including tolerant experience for juniors and
   the local and programs ways of working. Score from embedding similarity, skill overlap, domain,
   timezone overlap and company fit, with weights in private config. Threshold 80. Templated reasons
   (top 3) and one gap. No per-user LLM calls.
3. **Triggers.** New enriched job: match against eligible users. Profile change: re-match open jobs.
   Both as queue jobs that scale to thousands of jobs times hundreds of users (pre-filter by
   eligibility and role in SQL before scoring).
4. **Near misses.** Jobs that failed exactly one gate or scored 65–79, grouped by blocker with counts
   and a one-tap preference change ("show jobs without salary", "include yellow" for pass holders).
5. **Programs calendar.** From `data/programs/`: upcoming deadlines shown to users whose profile fits;
   honest-silence next steps for juniors (D7).
6. **Money-ask block.** Jobs flagged in enrichment as asking candidates for money never match (D11).
7. **Brief UI** through /impeccable (code-first, Operate): matches with tier badge and reason, verified-
   live time, score reasons and gap, actions Apply (opens the job; kits arrive in phase 09), Save, Not
   for me with a reason picker, Flag with the same reasons as Telegram and the fixed Wrong details
   picker from PLAN section 6. Flags are stored in `flags` for phase 09's rules, and the daily per-user
   flag limit applies from the first stored flag. All actions optimistic. Honest silence and near-miss states designed
   with the same care as the match state. Replace the phase 06 teaser with the real matcher.
8. **Feedback into scoring.** "Not for me" reasons adjust that user's future scoring (simple, explainable
   per-user weight nudges stored in the profile).
9. **Entitlements interface.** Create `packages/core/src/entitlements/` with a fixed interface that
   reads the `passes` table and answers instant vs delayed delivery, kit quota and yellow opt-in. Until
   phase 10 it returns free-tier answers for everyone except allowlisted test pass holders. Phases 08
   and 09 call only this module; phase 10 fills in the real pass logic behind the same interface.

## Suggested work orders

- A (opus): embeddings pipeline and storage. Owns `apps/worker/src/embed/` and related schema changes (coordinate migrations with the lead).
- B (opus): matcher gates, scoring, reasons, near misses, money-ask block, feedback nudges, entitlements interface. Owns `packages/core/src/matching/` and `packages/core/src/entitlements/`.
- C (opus): match triggers and fan-out queue jobs. Owns `apps/worker/src/match/`. Starts after B's interface lands.
- D (opus): Brief UI, programs calendar UI, teaser swap, through /impeccable. Owns the Brief routes and components.

Adversarial review (fresh, blind): gates and scoring for false positives (jobs that shouldn't reach a
user), and the performance of the fan-out.

## Checkpoint with the owner

The owner's own Brief on staging: do the matches feel right, is the silence state honest and useful?
Tune the threshold and weights with the owner if needed.

## Definition of done

- Owner's profile gets matches that the owner judges relevant (record their verdict), or an honest silence state with correct near-miss counts.
- A junior test profile sees program options and an honest-silence next step. Local jobs are best-effort, coming from ATS on-site or hybrid roles located in target countries until rabota.md or DOU grant permission.
- Matching a new job against all staging users completes within a stated time (report it).
- Finish reviewer verdict for the Brief; screenshots on the progress page.
