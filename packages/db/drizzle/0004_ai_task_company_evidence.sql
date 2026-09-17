SET lock_timeout = '5s';--> statement-breakpoint
-- Alone in its own file. Drizzle's migrator applies every pending migration in one transaction, so
-- when 0004 and 0005 go in together the new value is not usable until commit; 0005 does not use it.
ALTER TYPE "public"."ai_task" ADD VALUE IF NOT EXISTS 'company-evidence';
