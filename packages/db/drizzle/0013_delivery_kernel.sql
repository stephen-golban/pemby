SET lock_timeout = '5s';--> statement-breakpoint
-- Phase 08, delivery. Additive only: one new table, four nullable columns, two new indexes. No
-- column is dropped, no column is rewritten, every added column is nullable with no DEFAULT, and
-- nothing here names the `claimed` status that 0012 adds — the migrator runs both files in one
-- transaction and a new enum value cannot be used before that transaction commits.
--
-- `telegram_link_tokens` backs the deep link `t.me/<bot>?start=<token>` (PLAN D8). It stores the
-- SHA-256 of the token and never the token, and the payload carries no user id: the id is found by
-- looking the hash up, so a forwarded link leaks nothing and a guessed id binds nothing. Single
-- use and short-lived are enforced by `consumeTelegramLinkToken`'s one-statement conditional
-- update, not by the reader. `ON DELETE cascade` from `user`: deleting an account takes its
-- tokens with it.
--
-- `profiles.delivery_paused_at` is the user-level pause behind `/pause`, `/resume` and the
-- settings switch. On `profiles` because `profiles.user_id` is unique, so the table is already
-- 1:1 with the person, and because the pause is one decision about the person rather than three
-- about their channels — `channels.enabled` stays the per-channel switch and `/resume` must not
-- silently turn a channel back on that the user had switched off.
--
-- `channels.dead_at` / `dead_reason` record a channel the *system* found gone: the bot writes them
-- when Telegram reports a block (`my_chat_member`), the dispatcher when a provider refuses
-- permanently. Kept apart from `enabled`, which is the user's own switch, so the settings page can
-- say what happened instead of implying the user did it. `dead_reason` is text, not an enum
-- (precedent: `companies.evidence_status`): nothing queries on it and providers invent new
-- permanent failures faster than a migration is worth.
--
-- `delivery_log.sent_at` is when the provider accepted the message, as distinct from `created_at`,
-- which is now when the row was *claimed*.
--
-- `delivery_log_match_channel_live_uq` is the exactly-once lock (see ../src/queries/delivery.ts).
-- It cannot conflict with existing data: `delivery_log_match_channel_sent_uq` has held the same
-- pairs unique for every `sent` row since 0001, `failed` and `skipped` rows are outside the
-- predicate, and no `claimed` row exists yet. Built without CONCURRENTLY because the migrator runs
-- inside a transaction; the table is small and `lock_timeout` above bounds the wait.
CREATE TABLE "telegram_link_tokens" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by_chat_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "delivery_paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "dead_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "dead_reason" text;--> statement-breakpoint
ALTER TABLE "delivery_log" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "telegram_link_tokens" ADD CONSTRAINT "telegram_link_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_link_tokens_hash_uq" ON "telegram_link_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "telegram_link_tokens_expires_idx" ON "telegram_link_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "telegram_link_tokens_user_idx" ON "telegram_link_tokens" USING btree ("user_id");--> statement-breakpoint
-- The lock. One live row per (match, channel): a claim in flight, or a completed send.
CREATE UNIQUE INDEX "delivery_log_match_channel_live_uq" ON "delivery_log" USING btree ("match_id","channel_type") WHERE "delivery_log"."match_id" is not null and "delivery_log"."status" <> 'failed' and "delivery_log"."status" <> 'skipped';--> statement-breakpoint
-- For the stale-claim sweep. Plain and composite rather than partial on `status = 'claimed'`,
-- which 0012 has not committed yet; see the note in ../src/schema/delivery.ts.
CREATE INDEX "delivery_log_status_created_idx" ON "delivery_log" USING btree ("status","created_at");