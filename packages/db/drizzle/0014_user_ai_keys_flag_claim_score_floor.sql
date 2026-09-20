SET lock_timeout = '5s';--> statement-breakpoint
-- Phase 09, the db kernel. Additive only: one new table, three new columns, one new partial unique
-- index. Nothing is dropped, no type is changed, **no enum value is added** — which is the only
-- reason these changes may share one file (precedent: 0012 and 0013, where the new enum value had
-- to ship alone). Safe to run against a live staging database.
--
-- `user_ai_keys` is the whole of phase 09's net-new schema. `kits`, `applications`, `flags`,
-- `eligibility_evidence` and `ai_usage` all shipped in 0001 and are live; `job_status` already has
-- `quarantined` and `flag_action` already has every action PLAN section 6 names.
--
-- **`user_ai_keys` stores a secret and has no plaintext column.** `encrypted_key` is base64 of
-- `version(1) || iv(12) || authTag(16) || ciphertext` (AES-256-GCM, a fresh 12-byte IV per
-- encryption, produced by `encryptUserKey` in `@pemby/ai`). The leading version byte is here now
-- because adding it later would be another migration. `key_hash` is the lower-case hex SHA-256 of
-- the key and is NOT a credential and NOT a lookup key: it exists only to build the deep links
-- (`openrouter.ai/keys/<hash>`, `openrouter.ai/logs?api_key_hash=<hash>`) that let the user manage
-- their own key, and which resolve only for the signed-in owner. Pemby cannot revoke a user's key.
-- There is deliberately no unique index on `key_hash` — nothing looks a row up by it, and two
-- accounts connecting the same key is a fact about them rather than a collision to police.
--
-- `user_ai_keys.user_id` is UNIQUE (one connected account per user) and ON DELETE cascade. Cascade
-- is the only correct option of the three: `restrict` would break `deleteUserAndCvRows`, which
-- knows about `cv_files` and nothing else, so deleting an account would start failing; `set null`
-- would leave an encrypted secret behind attributable to nobody and deletable by nothing. There is
-- no `match_id` on this table, so `retireStaleMatches`'s "safe to delete" predicate needs no new
-- `not exists` clause.
--
-- `profiles.score_floor` is the per-user score bar (owner decision 2026-09-19, amending PLAN D6).
-- **NULL means "use the configured threshold"** — the private-config value, currently 75 — so every
-- one of the existing profile rows keeps behaving exactly as it does today. No DEFAULT, on purpose:
-- a default would bake today's threshold into rows nobody has touched and make a later change to
-- the configured value a no-op for them.
--
-- `flags.processing_at` turns selecting a flag into claiming one. The PLAN section 6 rules close
-- jobs, quarantine jobs and queue re-enrichment, and re-enrichment costs a model call, so
-- processing one flag twice is a double spend against a real job. `flag_status`'s four values are
-- all verdicts (`open`, `auto_resolved`, `needs_review`, `dismissed`); writing one before the rule
-- has decided would be false, and adding a fifth would be an enum migration that has to ship alone.
-- A nullable timestamp claims the row inside one `update ... where id in (select ... for update of
-- <flags alias> skip locked)` and re-offers a claim older than the caller's cutoff — the same shape
-- and the same trade as `delivery_log`'s claim in 0013: a crashed processor means a flag is looked
-- at again, never that it is lost.
--
-- `flags.claim_attempts` is the bound on "looked at again". Without it, a flag that is claimed and
-- never resolved is re-offered for ever, and every cycle may re-queue enrichment and spend money.
-- The claim increments it and refuses a flag at or above `maxAttempts`; an exhausted flag stays
-- `status = 'open'`, which is where `selectFlagsForReview` finds it — giving up means a human sees
-- it, not that it vanishes. NOT NULL with a constant DEFAULT is a catalog change in Postgres 11+,
-- not a table rewrite, so it is as additive as the nullable columns beside it.
--
-- **`eligibility_evidence_flag_subject_scope_uq` is a correctness constraint, not an optimisation.**
-- The tier-downgrade rule sums `weight` over red flag evidence and steps a company's tier down at
-- 2 (`packages/core/src/eligibility/engine/index.ts`). The flag processor is at-least-once by
-- design, so a worker dying between the evidence write and the verdict write has its flag re-offered
-- and writes the evidence a second time — and **two copies of one person's single flag reach the
-- threshold on their own and downgrade a real company.** This index makes that impossible.
-- `(flag_id, subject, scope)` rather than `flag_id` alone because one flag legitimately produces a
-- `subject='job'` row and a `subject='company'` row; `verdict` is deliberately out of the key so a
-- retry that arrived at a different verdict is refused rather than stored twice. Partial on
-- `flag_id is not null` because almost every row comes from a post or a careers page and carries no
-- flag.
--
-- Index-build safety, measured on staging 2026-09-19 before writing this: `eligibility_evidence`
-- holds 106,384 rows, of which exactly **1** carries a `flag_id`, and **0** groups of
-- `(flag_id, subject, scope)` have more than one row — so the build cannot fail on existing data.
-- Built without CONCURRENTLY because the migrator runs inside a transaction, exactly as 0013's
-- `delivery_log_match_channel_live_uq` was; the predicate makes the index one entry wide and
-- `lock_timeout` above bounds the wait for the lock.
CREATE TABLE "user_ai_keys" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"encrypted_key" text NOT NULL,
	"key_hash" text NOT NULL,
	"label" text,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_ai_keys_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "score_floor" smallint;--> statement-breakpoint
ALTER TABLE "flags" ADD COLUMN "processing_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "flags" ADD COLUMN "claim_attempts" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_ai_keys" ADD CONSTRAINT "user_ai_keys_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "eligibility_evidence_flag_subject_scope_uq" ON "eligibility_evidence" USING btree ("flag_id","subject","scope") WHERE "eligibility_evidence"."flag_id" is not null;--> statement-breakpoint
-- Column comments, so the meaning of a NULL is readable from `\d+` and from any client that shows
-- them, not only from the TypeScript schema. Comments are metadata: drizzle-kit does not track
-- them in its snapshots, so these are hand-written here and will never be diffed away — and will
-- not be reproduced if anyone regenerates this file.
COMMENT ON COLUMN "profiles"."score_floor" IS 'Per-user score bar (PLAN D6 as amended 2026-09-19). NULL means: use the configured threshold from the private config (currently 75), so an untouched profile behaves exactly as it did before this column existed. No DEFAULT on purpose. Refused below the near-miss band floor (65) server-side.';--> statement-breakpoint
COMMENT ON COLUMN "flags"."processing_at" IS 'When a worker claimed this flag for the PLAN section 6 rules; NULL when unclaimed. Claimed with FOR UPDATE OF flags SKIP LOCKED; a claim older than the caller''s cutoff is re-offered. Cleared when the verdict is written.';--> statement-breakpoint
COMMENT ON COLUMN "flags"."claim_attempts" IS 'Claims made on this flag. The claim refuses a flag at or above its maxAttempts, so a flag that is never resolved stops being reprocessed and is left status=open for the owner review queue instead.';--> statement-breakpoint
COMMENT ON COLUMN "user_ai_keys"."encrypted_key" IS 'base64 of version(1) || iv(12) || authTag(16) || ciphertext, AES-256-GCM. Never a plaintext key.';--> statement-breakpoint
COMMENT ON COLUMN "user_ai_keys"."key_hash" IS 'Lower-case hex SHA-256 of the key. Not a credential and not a lookup key: it only builds the user''s own OpenRouter deep links.';
