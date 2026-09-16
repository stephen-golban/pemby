CREATE TYPE "public"."ai_task" AS ENUM('job-enrichment', 'cv-parse', 'job-embedding', 'profile-embedding', 'application-kit');--> statement-breakpoint
CREATE TYPE "public"."application_state" AS ENUM('applied', 'screening', 'interviewing', 'offer', 'rejected', 'withdrawn', 'no_response');--> statement-breakpoint
CREATE TYPE "public"."ats_type" AS ENUM('greenhouse', 'lever', 'ashby', 'workable', 'smartrecruiters', 'recruitee', 'personio', 'other');--> statement-breakpoint
CREATE TYPE "public"."channel_type" AS ENUM('telegram', 'email', 'push');--> statement-breakpoint
CREATE TYPE "public"."cv_parse_status" AS ENUM('pending', 'parsed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."delivery_kind" AS ENUM('match', 'pass_reminder', 'system');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."eligibility_tier" AS ENUM('green', 'yellow', 'white', 'red');--> statement-breakpoint
CREATE TYPE "public"."employment_type" AS ENUM('full_time', 'part_time', 'contract_to_hire');--> statement-breakpoint
CREATE TYPE "public"."english_level" AS ENUM('a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'native');--> statement-breakpoint
CREATE TYPE "public"."evidence_source" AS ENUM('post', 'careers_page', 'eor', 'user_report', 'flag');--> statement-breakpoint
CREATE TYPE "public"."evidence_subject" AS ENUM('job', 'company');--> statement-breakpoint
CREATE TYPE "public"."flag_action" AS ENUM('none', 'job_closed', 'reverification_queued', 'tier_downgraded', 'quarantined', 're_enriched', 'merged', 'sent_to_review');--> statement-breakpoint
CREATE TYPE "public"."flag_field" AS ENUM('salary', 'seniority', 'stack', 'location', 'eligibility');--> statement-breakpoint
CREATE TYPE "public"."flag_reason" AS ENUM('closed_or_fake', 'not_hiring_from_country', 'scam', 'wrong_details', 'duplicate', 'other');--> statement-breakpoint
CREATE TYPE "public"."flag_status" AS ENUM('open', 'auto_resolved', 'needs_review', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('open', 'closed', 'quarantined', 'merged');--> statement-breakpoint
CREATE TYPE "public"."key_class" AS ENUM('public', 'private', 'user');--> statement-breakpoint
CREATE TYPE "public"."match_gate" AS ENUM('eligibility', 'way_of_working', 'freshness', 'seniority', 'dealbreaker', 'salary', 'salary_missing', 'score');--> statement-breakpoint
CREATE TYPE "public"."match_kind" AS ENUM('match', 'near_miss');--> statement-breakpoint
CREATE TYPE "public"."match_pass_reason" AS ENUM('location', 'salary', 'seniority', 'stack', 'company', 'role', 'already_applied', 'other');--> statement-breakpoint
CREATE TYPE "public"."match_state" AS ENUM('new', 'saved', 'applied', 'passed');--> statement-breakpoint
CREATE TYPE "public"."pass_product" AS ENUM('pass_1m', 'pass_3m', 'pass_6m');--> statement-breakpoint
CREATE TYPE "public"."pass_source" AS ENUM('purchase', 'referral', 'guarantee', 'share');--> statement-breakpoint
CREATE TYPE "public"."pay_period" AS ENUM('hour', 'day', 'month', 'year');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('dodo', 'paddle');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'paid', 'failed', 'refunded', 'partially_refunded');--> statement-breakpoint
CREATE TYPE "public"."referral_status" AS ENUM('pending', 'qualified', 'purchased');--> statement-breakpoint
CREATE TYPE "public"."seniority" AS ENUM('intern', 'junior', 'middle', 'senior', 'lead', 'principal');--> statement-breakpoint
CREATE TYPE "public"."way_of_working" AS ENUM('b2b_contractor', 'eor_employee', 'relocation_visa', 'freelance', 'local', 'paid_program');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_anonymous" boolean DEFAULT false,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cv_files" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"bucket_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"extracted_text" text,
	"parsed" jsonb,
	"parse_status" "cv_parse_status" DEFAULT 'pending' NOT NULL,
	"parse_model" text,
	"parse_prompt_version" text,
	"parsed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cv_files_bucket_key_unique" UNIQUE("bucket_key")
);
--> statement-breakpoint
CREATE TABLE "profile_embeddings" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"model" text DEFAULT 'qwen/qwen3-embedding-8b' NOT NULL,
	"content_hash" text NOT NULL,
	"embedding" halfvec(2048) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"display_name" text,
	"citizenships" text[] DEFAULT '{}'::text[] NOT NULL,
	"residence_country" text,
	"timezone" text,
	"min_overlap_hours" smallint,
	"has_own_company" boolean DEFAULT false NOT NULL,
	"permits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"english_level" "english_level",
	"ways_of_working" "way_of_working"[] DEFAULT '{}' NOT NULL,
	"employment_types" "employment_type"[] DEFAULT '{}' NOT NULL,
	"titles" text[] DEFAULT '{}'::text[] NOT NULL,
	"seniority" "seniority",
	"years_experience" smallint,
	"stack" text[] DEFAULT '{}'::text[] NOT NULL,
	"dealbreakers" text[] DEFAULT '{}'::text[] NOT NULL,
	"min_rate" integer,
	"min_rate_currency" text,
	"min_rate_period" "pay_period",
	"hide_no_salary" boolean DEFAULT false NOT NULL,
	"include_yellow" boolean DEFAULT false NOT NULL,
	"company_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"application_defaults" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"referral_code" text,
	"onboarding_completed_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "profiles_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"domain" text,
	"website_url" text,
	"careers_url" text,
	"ats_type" "ats_type",
	"ats_board_token" text,
	"hq_country" text,
	"evidence_checked_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_slug_unique" UNIQUE("slug"),
	CONSTRAINT "companies_ats_board_uq" UNIQUE("ats_type","ats_board_token")
);
--> statement-breakpoint
CREATE TABLE "job_eligibility" (
	"job_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"way_of_working" "way_of_working" NOT NULL,
	"tier" "eligibility_tier" NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_eligibility_pk" PRIMARY KEY("job_id","scope","way_of_working")
);
--> statement-breakpoint
CREATE TABLE "job_embeddings" (
	"job_id" uuid PRIMARY KEY NOT NULL,
	"model" text DEFAULT 'qwen/qwen3-embedding-8b' NOT NULL,
	"content_hash" text NOT NULL,
	"embedding" halfvec(2048) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_enrichment" (
	"job_id" uuid PRIMARY KEY NOT NULL,
	"role_family" text,
	"seniority" "seniority",
	"years_min" smallint,
	"stack" text[] DEFAULT '{}'::text[] NOT NULL,
	"domains" text[] DEFAULT '{}'::text[] NOT NULL,
	"employment_types" "employment_type"[] DEFAULT '{}' NOT NULL,
	"ways_of_working" "way_of_working"[] DEFAULT '{}' NOT NULL,
	"salary_min" integer,
	"salary_max" integer,
	"salary_currency" text,
	"salary_period" "pay_period",
	"timezone_requirement" text,
	"eligibility_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"asks_candidate_for_money" boolean DEFAULT false NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"key_class" "key_class" DEFAULT 'public' NOT NULL,
	"enriched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"url" text NOT NULL,
	"apply_url" text,
	"title" text NOT NULL,
	"location_text" text,
	"raw_text" text NOT NULL,
	"content_hash" text NOT NULL,
	"status" "job_status" DEFAULT 'open' NOT NULL,
	"posted_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_verified_live_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"duplicate_of_job_id" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_company_source_external_id_uq" UNIQUE("company_id","source","external_id")
);
--> statement-breakpoint
CREATE TABLE "eligibility_evidence" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"subject" "evidence_subject" NOT NULL,
	"job_id" uuid,
	"company_id" uuid,
	"scope" text NOT NULL,
	"way_of_working" "way_of_working",
	"verdict" "eligibility_tier" NOT NULL,
	"source" "evidence_source" NOT NULL,
	"weight" real DEFAULT 1 NOT NULL,
	"excerpt" text,
	"source_url" text,
	"flag_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eligibility_evidence_subject_ck" CHECK (("eligibility_evidence"."subject" = 'job' and "eligibility_evidence"."job_id" is not null) or ("eligibility_evidence"."subject" = 'company' and "eligibility_evidence"."company_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "flags" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"job_id" uuid NOT NULL,
	"user_id" text,
	"reason" "flag_reason" NOT NULL,
	"country" text,
	"field" "flag_field",
	"field_value" text,
	"note" text,
	"weight" real DEFAULT 1 NOT NULL,
	"status" "flag_status" DEFAULT 'open' NOT NULL,
	"action_taken" "flag_action",
	"duplicate_of_job_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"job_id" uuid NOT NULL,
	"match_id" uuid,
	"state" "application_state" DEFAULT 'applied' NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rejected_for_location" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_user_job_uq" UNIQUE("user_id","job_id")
);
--> statement-breakpoint
CREATE TABLE "kits" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"job_id" uuid NOT NULL,
	"match_id" uuid,
	"content" jsonb NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"key_class" "key_class" NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"job_id" uuid NOT NULL,
	"kind" "match_kind" NOT NULL,
	"blocker" "match_gate",
	"gate_results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"score" smallint NOT NULL,
	"tier" "eligibility_tier" NOT NULL,
	"way_of_working" "way_of_working",
	"reasons" text[] DEFAULT '{}'::text[] NOT NULL,
	"gap" text,
	"state" "match_state" DEFAULT 'new' NOT NULL,
	"pass_reason" "match_pass_reason",
	"state_changed_at" timestamp with time zone,
	"deliver_after" timestamp with time zone,
	"telegram_delivered_at" timestamp with time zone,
	"email_delivered_at" timestamp with time zone,
	"push_delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_user_job_uq" UNIQUE("user_id","job_id")
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text,
	"task" "ai_task" NOT NULL,
	"model" text NOT NULL,
	"key_class" "key_class" NOT NULL,
	"prompt_version" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"generation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"source" "pass_source" NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"paused_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"payment_id" uuid,
	"referral_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "passes_range_ck" CHECK ("passes"."ends_at" > "passes"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text,
	"provider" "payment_provider" NOT NULL,
	"provider_ref" text NOT NULL,
	"product" "pass_product" NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"refunded_cents" integer DEFAULT 0 NOT NULL,
	"refunds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_provider_ref_uq" UNIQUE("provider","provider_ref")
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"referrer_user_id" text NOT NULL,
	"referee_user_id" text NOT NULL,
	"code" text NOT NULL,
	"status" "referral_status" DEFAULT 'pending' NOT NULL,
	"qualified_at" timestamp with time zone,
	"purchased_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referrals_referee_user_id_unique" UNIQUE("referee_user_id"),
	CONSTRAINT "referrals_not_self_ck" CHECK ("referrals"."referrer_user_id" <> "referrals"."referee_user_id")
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"type" "channel_type" NOT NULL,
	"address" text NOT NULL,
	"push_keys" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"verified_at" timestamp with time zone,
	"quiet_start_minute" smallint,
	"quiet_end_minute" smallint,
	"timezone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"match_id" uuid,
	"channel_id" uuid,
	"channel_type" "channel_type" NOT NULL,
	"kind" "delivery_kind" NOT NULL,
	"status" "delivery_status" NOT NULL,
	"late" boolean DEFAULT false NOT NULL,
	"provider_message_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_files" ADD CONSTRAINT "cv_files_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_embeddings" ADD CONSTRAINT "profile_embeddings_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_eligibility" ADD CONSTRAINT "job_eligibility_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_embeddings" ADD CONSTRAINT "job_embeddings_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_enrichment" ADD CONSTRAINT "job_enrichment_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_duplicate_of_job_id_jobs_id_fk" FOREIGN KEY ("duplicate_of_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility_evidence" ADD CONSTRAINT "eligibility_evidence_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility_evidence" ADD CONSTRAINT "eligibility_evidence_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility_evidence" ADD CONSTRAINT "eligibility_evidence_flag_id_flags_id_fk" FOREIGN KEY ("flag_id") REFERENCES "public"."flags"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_duplicate_of_job_id_jobs_id_fk" FOREIGN KEY ("duplicate_of_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kits" ADD CONSTRAINT "kits_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kits" ADD CONSTRAINT "kits_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kits" ADD CONSTRAINT "kits_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passes" ADD CONSTRAINT "passes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passes" ADD CONSTRAINT "passes_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passes" ADD CONSTRAINT "passes_referral_id_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_user_id_user_id_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referee_user_id_user_id_fk" FOREIGN KEY ("referee_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_log" ADD CONSTRAINT "delivery_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_log" ADD CONSTRAINT "delivery_log_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_log" ADD CONSTRAINT "delivery_log_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_isAnonymous_createdAt_idx" ON "user" USING btree ("is_anonymous","created_at");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "cv_files_user_id_idx" ON "cv_files" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cv_files_expires_at_idx" ON "cv_files" USING btree ("expires_at") WHERE "cv_files"."expires_at" is not null;--> statement-breakpoint
CREATE INDEX "profile_embeddings_hnsw_idx" ON "profile_embeddings" USING hnsw ("embedding" halfvec_cosine_ops);--> statement-breakpoint
CREATE INDEX "profiles_residence_country_idx" ON "profiles" USING btree ("residence_country");--> statement-breakpoint
CREATE INDEX "companies_domain_idx" ON "companies" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "job_eligibility_scope_tier_idx" ON "job_eligibility" USING btree ("scope","tier","way_of_working");--> statement-breakpoint
CREATE INDEX "job_embeddings_hnsw_idx" ON "job_embeddings" USING hnsw ("embedding" halfvec_cosine_ops);--> statement-breakpoint
CREATE INDEX "job_enrichment_stack_gin_idx" ON "job_enrichment" USING gin ("stack");--> statement-breakpoint
CREATE INDEX "job_enrichment_ways_gin_idx" ON "job_enrichment" USING gin ("ways_of_working");--> statement-breakpoint
CREATE INDEX "job_enrichment_seniority_idx" ON "job_enrichment" USING btree ("seniority");--> statement-breakpoint
CREATE INDEX "jobs_company_id_idx" ON "jobs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "jobs_status_verified_idx" ON "jobs" USING btree ("status","last_verified_live_at");--> statement-breakpoint
CREATE INDEX "jobs_first_seen_at_idx" ON "jobs" USING btree ("first_seen_at");--> statement-breakpoint
CREATE INDEX "eligibility_evidence_job_idx" ON "eligibility_evidence" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "eligibility_evidence_company_scope_idx" ON "eligibility_evidence" USING btree ("company_id","scope");--> statement-breakpoint
CREATE INDEX "flags_job_reason_idx" ON "flags" USING btree ("job_id","reason");--> statement-breakpoint
CREATE UNIQUE INDEX "flags_job_user_reason_uq" ON "flags" USING btree ("job_id","user_id","reason") WHERE "flags"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "flags_user_created_idx" ON "flags" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "flags_status_idx" ON "flags" USING btree ("status");--> statement-breakpoint
CREATE INDEX "applications_user_state_idx" ON "applications" USING btree ("user_id","state");--> statement-breakpoint
CREATE INDEX "kits_user_created_idx" ON "kits" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "matches_user_kind_state_idx" ON "matches" USING btree ("user_id","kind","state");--> statement-breakpoint
CREATE INDEX "matches_job_idx" ON "matches" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "matches_deliver_after_idx" ON "matches" USING btree ("deliver_after") WHERE "matches"."kind" = 'match';--> statement-breakpoint
CREATE INDEX "ai_usage_created_idx" ON "ai_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_user_task_created_idx" ON "ai_usage" USING btree ("user_id","task","created_at");--> statement-breakpoint
CREATE INDEX "passes_user_ends_idx" ON "passes" USING btree ("user_id","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "passes_payment_id_uq" ON "passes" USING btree ("payment_id") WHERE "passes"."payment_id" is not null;--> statement-breakpoint
CREATE INDEX "payments_user_idx" ON "payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "referrals_referrer_idx" ON "referrals" USING btree ("referrer_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channels_type_address_uq" ON "channels" USING btree ("type","address");--> statement-breakpoint
CREATE INDEX "channels_user_idx" ON "channels" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_log_match_channel_sent_uq" ON "delivery_log" USING btree ("match_id","channel_type") WHERE "delivery_log"."status" = 'sent' and "delivery_log"."match_id" is not null;--> statement-breakpoint
CREATE INDEX "delivery_log_user_created_idx" ON "delivery_log" USING btree ("user_id","created_at");