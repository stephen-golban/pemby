SET lock_timeout = '5s';--> statement-breakpoint
CREATE TABLE "ai_cap_alerts" (
	"day" date PRIMARY KEY NOT NULL,
	"spent_usd" numeric(12, 6) NOT NULL,
	"cap_usd" numeric(12, 6) NOT NULL,
	"channel" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_via" text,
	"attempts" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "evidence_status" text;--> statement-breakpoint
ALTER TABLE "job_eligibility" ADD COLUMN "evidence" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "job_eligibility" ADD COLUMN "engine_version" text;--> statement-breakpoint
ALTER TABLE "job_enrichment" ADD COLUMN "timezone_constraint" jsonb;--> statement-breakpoint
ALTER TABLE "job_enrichment" ADD COLUMN "visa_sponsorship" text;--> statement-breakpoint
ALTER TABLE "job_enrichment" ADD COLUMN "red_flags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "job_enrichment" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "job_enrichment" ADD COLUMN "output" jsonb;--> statement-breakpoint
ALTER TABLE "job_enrichment" ADD COLUMN "rules_version" text;--> statement-breakpoint
ALTER TABLE "eligibility_evidence" ADD COLUMN "fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eligibility_evidence" ADD COLUMN "extractor_version" text;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "cost_estimated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "latency_ms" integer;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "outcome" text DEFAULT 'ok' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "attempted_models" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "job_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "run_label" text;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "ai_usage" VALIDATE CONSTRAINT "ai_usage_job_id_jobs_id_fk";--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "ai_usage" VALIDATE CONSTRAINT "ai_usage_company_id_companies_id_fk";--> statement-breakpoint
CREATE INDEX "ai_usage_task_created_idx" ON "ai_usage" USING btree ("task","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_job_created_idx" ON "ai_usage" USING btree ("job_id","created_at") WHERE "ai_usage"."job_id" is not null;