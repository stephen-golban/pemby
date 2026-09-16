CREATE TYPE "public"."board_status" AS ENUM('active', 'empty', 'not-found', 'erroring');--> statement-breakpoint
CREATE TABLE "company_source_health" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error_kind" text,
	"last_error_message" text,
	"consecutive_errors" integer DEFAULT 0 NOT NULL,
	"consecutive_not_found" integer DEFAULT 0 NOT NULL,
	"total_errors" integer DEFAULT 0 NOT NULL,
	"total_runs" integer DEFAULT 0 NOT NULL,
	"jobs_listed" integer DEFAULT 0 NOT NULL,
	"jobs_kept" integer DEFAULT 0 NOT NULL,
	"jobs_open" integer DEFAULT 0 NOT NULL,
	"board_status" "board_status" DEFAULT 'active' NOT NULL,
	"consecutive_empty_lists" integer DEFAULT 0 NOT NULL,
	"empty_list_since" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "ats_region" text DEFAULT 'us' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "ingest_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "source_list" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "description_html" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "locations" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "workplace_type" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "department" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "employment_type" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "salary_min" numeric;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "salary_max" numeric;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "salary_currency" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "salary_period" "pay_period";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "salary_text" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "source_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "detail_fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "role_family" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
ALTER TABLE "company_source_health" ADD CONSTRAINT "company_source_health_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_source_health_board_status_idx" ON "company_source_health" USING btree ("board_status");--> statement-breakpoint
CREATE INDEX "jobs_dedupe_key_idx" ON "jobs" USING btree ("dedupe_key");