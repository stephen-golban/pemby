SET lock_timeout = '5s';--> statement-breakpoint
-- Phase 07 (matcher, near misses, the Brief). Additive only: four nullable-or-defaulted columns,
-- no enum change, no rewrite. Every DEFAULT here is a constant, so Postgres fills it in the
-- catalogue and none of these statements rewrites its table.
--
-- No new index. Both candidate queries in src/queries/matching.ts were EXPLAIN ANALYZEd against
-- staging (7.4k open jobs, 3k enriched, 117k eligibility rows) and already run on existing
-- indexes: the per-user query uses job_eligibility_scope_tier_idx (bitmap scan, 154 rows) plus
-- jobs_pkey and companies_pkey lookups at 3.7 ms, and the per-job query uses job_eligibility_pk
-- and job_enrichment_pkey at 0.3 ms. Nothing here justified another index.
--
-- PLAN D6: per-user, explainable scoring nudges from "Not for me" reasons. Namespaced keys
-- ("stack:kubernetes", "family:qa-sdet", "company:<uuid>") to additive deltas in -1..1.
ALTER TABLE "profiles" ADD COLUMN "scoring_nudges" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
-- job_eligibility stored only the rendered English of a verdict, so the web app had to recover the
-- key with a regex over the engine's templates. These two columns store what the engine already
-- knew, so the Brief and the teaser render a verdict through i18n instead. Nullable: rows written
-- before this migration keep only their English text.
ALTER TABLE "job_eligibility" ADD COLUMN "reason_key" text;--> statement-breakpoint
ALTER TABLE "job_eligibility" ADD COLUMN "reason_params" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
-- MatchScore.components (PLAN section 4), so a score can be explained and re-weighted without
-- re-running the matcher. Nullable: rows written before this migration have no breakdown.
ALTER TABLE "matches" ADD COLUMN "score_components" jsonb;
