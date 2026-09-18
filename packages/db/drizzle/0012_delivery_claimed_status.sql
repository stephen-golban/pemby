SET lock_timeout = '5s';--> statement-breakpoint
-- Alone in its own file (precedent: 0004, 0006). Drizzle's migrator applies pending migrations in
-- one transaction, so this value is not usable until commit; **0013 must not name it**, and does
-- not — its partial unique index is written as "not one of the terminal statuses" precisely so the
-- predicate mentions only values that already exist.
--
-- Phase 08. `delivery_status` was sent | failed | skipped: three verdicts, all of them past tense,
-- all of them written after the provider had already been called. That left no way to say "this
-- (match, channel) is being sent right now", and therefore no way for one dispatcher instance to
-- stop another from sending the same match a second time. The `status = 'sent'` partial unique
-- index cannot do it: by the time it refuses the second row, the second message has gone out.
--
-- `claimed` is the missing tense. The dispatcher inserts a `claimed` row first and only calls the
-- provider if that insert won the unique index; the row then moves to `sent` or `failed` in place.
-- `packages/db/src/queries/delivery.ts` holds the ordering, the failure mode it accepts and how a
-- claim left behind by a crashed process is recovered.
ALTER TYPE "public"."delivery_status" ADD VALUE IF NOT EXISTS 'claimed';
