SET lock_timeout = '5s';--> statement-breakpoint
-- Alone in its own file (precedent: 0004). Drizzle's migrator applies pending migrations in one
-- transaction, so these values are not usable until commit; 0007 does not use them.
ALTER TYPE "public"."cv_parse_status" ADD VALUE IF NOT EXISTS 'uploaded';--> statement-breakpoint
ALTER TYPE "public"."cv_parse_status" ADD VALUE IF NOT EXISTS 'extracting';--> statement-breakpoint
ALTER TYPE "public"."cv_parse_status" ADD VALUE IF NOT EXISTS 'unreadable';--> statement-breakpoint
ALTER TYPE "public"."cv_parse_status" ADD VALUE IF NOT EXISTS 'parsing';--> statement-breakpoint
ALTER TYPE "public"."cv_parse_status" ADD VALUE IF NOT EXISTS 'queued';
