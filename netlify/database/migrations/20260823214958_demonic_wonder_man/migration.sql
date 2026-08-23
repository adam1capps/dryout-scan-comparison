CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY,
	"slug" varchar(64) NOT NULL UNIQUE,
	"hostnames" jsonb DEFAULT '[]' NOT NULL,
	"editors" jsonb DEFAULT '[]' NOT NULL,
	"config" jsonb DEFAULT '{}' NOT NULL,
	"manifest" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vent_proposal_reasons" DROP CONSTRAINT "vent_proposal_reasons_building_key";--> statement-breakpoint
ALTER TABLE "collect_marks" ADD COLUMN "job_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "job_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "proposed_vents" ADD COLUMN "job_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_requests" ADD COLUMN "job_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "vent_proposal_reasons" ADD COLUMN "job_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "vent_proposal_reasons" ADD CONSTRAINT "vent_proposal_reasons_job_id_building_unique" UNIQUE("job_id","building");--> statement-breakpoint
ALTER TABLE "collect_marks" ADD CONSTRAINT "collect_marks_job_id_jobs_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id");--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_job_id_jobs_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id");--> statement-breakpoint
ALTER TABLE "proposed_vents" ADD CONSTRAINT "proposed_vents_job_id_jobs_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id");--> statement-breakpoint
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_job_id_jobs_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id");--> statement-breakpoint
ALTER TABLE "vent_proposal_reasons" ADD CONSTRAINT "vent_proposal_reasons_job_id_jobs_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id");