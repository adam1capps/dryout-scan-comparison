CREATE TABLE "quote_requests" (
	"id" serial PRIMARY KEY,
	"name" varchar(120) NOT NULL,
	"email" varchar(200) NOT NULL,
	"company" varchar(160) NOT NULL,
	"job_title" varchar(120) NOT NULL,
	"additional_sf" integer DEFAULT 0 NOT NULL,
	"notified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
