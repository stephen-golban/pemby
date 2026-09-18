SET lock_timeout = '5s';--> statement-breakpoint
-- Phase 07 follow-up. Additive only: four nullable-or-defaulted columns on `matches`, no enum
-- change, no rewrite. Every DEFAULT is a constant, so Postgres records it in the catalogue and none
-- of these statements rewrites the table.
--
-- `matches.reasons` and `matches.gap` stored **rendered English**, so the Brief printed a match's
-- own bullets un-i18n'd while every other reason surface in this phase — job_eligibility's
-- reason_key/reason_params, the gates, the programs — already stored a stable key plus its params.
-- These columns store what the score already knew (`MatchScore.reasons` is `ScoreReason[]`, `gap`
-- is a `ScoreReason`), so the Brief, and phase 08's Telegram and email, render through i18n.
--
-- The English columns stay and stay populated: rows written before this migration have nothing
-- else, and the UI falls back to them rather than showing an empty bullet.
--
-- No new index. Nothing queries on a reason key; these columns are read only alongside the match
-- row that the existing `matches_user_kind_state_idx` already finds.
ALTER TABLE "matches" ADD COLUMN "reason_keys" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
-- One params object per entry of reason_keys, in the same order; the matcher writes all three
-- reason columns from the same `MatchScore.reasons` array.
ALTER TABLE "matches" ADD COLUMN "reason_params" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- The gap is a single reason, so it takes the job_eligibility shape: one key, one params object.
ALTER TABLE "matches" ADD COLUMN "gap_key" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "gap_params" jsonb DEFAULT '{}'::jsonb NOT NULL;
