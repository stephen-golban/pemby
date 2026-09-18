SET lock_timeout = '5s';--> statement-breakpoint
-- Phase 07 follow-up. Additive: four nullable columns and one guarded backfill of them. Nothing is
-- dropped, no type changes, no default, so none of these statements rewrites a table.
--
-- `embed.sweep` asked "is this vector older than its sources?" with
-- `job_embeddings.updated_at < greatest(jobs.updated_at, job_enrichment.updated_at)`, and the
-- handler answered the real question — "is the embedded text the same text?" — with a content hash
-- it then threw away. Neither half of that held up:
--
--  * `jobs.updated_at` moves on the hourly liveness touch (`verify-live` stamps
--    `last_verified_live_at` on every open job, and `updated_at` goes with it) without a word of
--    the post changing. On staging that alone accounted for 3,264 of the 3,285 permanently stale
--    rows, and it re-armed the whole corpus every hour.
--  * `job_enrichment.updated_at` moves whenever enrichment is rewritten, including when it rewrites
--    the same five fields.
--  * Nothing moved on the left when the handler decided there was nothing to do.
--
-- Ordered `first_seen_at desc` and limited to 50, those rows sat at the head for ever: 4,972
-- `embed.job` runs, zero model calls, zero vectors, and a job that genuinely needed one never
-- reached. These columns are the missing record.
--
-- `source_key` is an opaque string naming the recipe generation and the source fingerprint a vector
-- was confirmed against: on `job_embeddings`, `EMBED_TEXT_VERSION || ':' || jobs.content_hash`, in
-- the same shape and for the same reason `job_enrichment.content_hash` is compared against
-- `jobs.content_hash` in `selectJobsToEnrich`; on `profile_embeddings`, `EMBED_TEXT_VERSION` alone,
-- because a profile has no post to fingerprint. The version rides along so that bumping the
-- embedding recipe still re-embeds what is stored, which is what that constant promises.
--
-- `checked_at` covers the sources that have only a timestamp, and is read with `<`, never equality:
-- a `timestamptz` carries microseconds and a JS `Date` does not, so a value that has been through
-- the driver comes back slightly *earlier* than what is stored, and an equality test against a
-- source timestamp is one many rows could never pass.
--
-- `updated_at` keeps its old meaning on both tables — "the vector changed" — because
-- `match/sweep.ts` reads `job_embeddings.updated_at` as exactly that. Recording the check there
-- instead would have told the matcher the vector had moved every time the embedder confirmed it
-- had not.
ALTER TABLE "job_embeddings" ADD COLUMN "source_key" text;--> statement-breakpoint
ALTER TABLE "job_embeddings" ADD COLUMN "checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profile_embeddings" ADD COLUMN "source_key" text;--> statement-breakpoint
ALTER TABLE "profile_embeddings" ADD COLUMN "checked_at" timestamp with time zone;--> statement-breakpoint

-- Backfill, guarded so it can only state what the existing rows already prove. A row it cannot
-- prove keeps its nulls and is re-checked exactly once, which costs a database read and a hash and
-- no model call. Without it every stored vector would be re-checked, and at 50 a sweep a corpus of
-- a few thousand takes days to settle.
--
-- The guard: the vector was written at or after this enrichment's last write, so it saw these
-- enrichment fields; and the enrichment was itself built from the post that is stored now
-- (`e.content_hash = j.content_hash`), so the vector saw this post too. `checked_at` takes
-- `je.updated_at` rather than `now()` — the moment the claim is actually good for. On staging this
-- proved 7,405 of 7,427 rows.
--
-- The `'1'` is `EMBED_TEXT_VERSION` (apps/worker/src/embed/text.ts) as it stands when this
-- migration is written, which is the generation every stored vector was in fact built under. It is
-- a literal here on purpose: a later bump must leave this statement alone and re-embed instead.
UPDATE "job_embeddings" je
   SET "source_key" = '1:' || j."content_hash",
       "checked_at" = je."updated_at"
  FROM "jobs" j
  JOIN "job_enrichment" e ON e."job_id" = j."id"
 WHERE je."job_id" = j."id"
   AND je."updated_at" >= e."updated_at"
   AND e."content_hash" = j."content_hash";--> statement-breakpoint

-- Same guard for profiles: the vector was written at or after the profile row's last write and at
-- or after the newest parsed CV, so it saw both. `max(updated_at)` over the parsed rows is the
-- watermark `selectProfilesToEmbed` compares against, so it is the one the guard uses.
UPDATE "profile_embeddings" pe
   SET "source_key" = '1',
       "checked_at" = pe."updated_at"
  FROM "profiles" p
  LEFT JOIN LATERAL (
    SELECT max(c."updated_at") AS "parsed_at"
      FROM "cv_files" c
     WHERE c."user_id" = p."user_id" AND c."parse_status" = 'parsed'
  ) cv ON true
 WHERE pe."profile_id" = p."id"
   AND pe."updated_at" >= p."updated_at"
   AND pe."updated_at" >= coalesce(cv."parsed_at", p."updated_at");
