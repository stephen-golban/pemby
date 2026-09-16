SET lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "company_source_health" ADD COLUMN "not_found_since" timestamp with time zone;