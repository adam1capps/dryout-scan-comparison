CREATE TABLE "change_orders" (
	"id" serial PRIMARY KEY,
	"job_id" integer NOT NULL,
	"number" integer NOT NULL,
	"token" varchar(64) NOT NULL UNIQUE,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"lines" jsonb DEFAULT '[]' NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"client_name" varchar(160) DEFAULT '' NOT NULL,
	"client_email" varchar(200) DEFAULT '' NOT NULL,
	"snapshot" jsonb DEFAULT '{}' NOT NULL,
	"document_key" varchar(160),
	"signed_document_key" varchar(160),
	"signature" jsonb,
	"sent_at" timestamp,
	"viewed_at" timestamp,
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "change_orders_job_id_number_unique" UNIQUE("job_id","number")
);
--> statement-breakpoint
ALTER TABLE "change_orders" ADD CONSTRAINT "change_orders_job_id_jobs_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id");