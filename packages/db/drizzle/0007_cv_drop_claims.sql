SET lock_timeout = '5s';--> statement-breakpoint
CREATE TABLE "pending_claims" (
	"anonymous_user_id" text PRIMARY KEY NOT NULL,
	"new_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pending_claims_new_user_id_unique" UNIQUE("new_user_id")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
ALTER TABLE "cv_files" ALTER COLUMN "bucket_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cv_files" ADD COLUMN "source" text DEFAULT 'file' NOT NULL;--> statement-breakpoint
ALTER TABLE "cv_files" ADD COLUMN "parsed_partial" jsonb;--> statement-breakpoint
ALTER TABLE "cv_files" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "cv_files" ADD COLUMN "queued_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cv_files" ADD COLUMN "stage_timings" jsonb;--> statement-breakpoint
ALTER TABLE "pending_claims" ADD CONSTRAINT "pending_claims_anonymous_user_id_user_id_fk" FOREIGN KEY ("anonymous_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_claims" ADD CONSTRAINT "pending_claims_new_user_id_user_id_fk" FOREIGN KEY ("new_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
