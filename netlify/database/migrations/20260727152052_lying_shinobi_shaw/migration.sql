CREATE TABLE "collect_marks" (
	"id" serial PRIMARY KEY,
	"building" varchar(8) NOT NULL,
	"view" varchar(8) DEFAULT 'ov' NOT NULL,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" serial PRIMARY KEY,
	"building" varchar(8) NOT NULL,
	"view" varchar(8) DEFAULT 'ov' NOT NULL,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"name" varchar(200) NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" varchar(20) DEFAULT 'Open' NOT NULL,
	"found_on" varchar(10) NOT NULL,
	"photo_key" varchar(120),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposed_vents" (
	"id" serial PRIMARY KEY,
	"building" varchar(8) NOT NULL,
	"view" varchar(8) DEFAULT 'ov' NOT NULL,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vent_proposal_reasons" (
	"id" serial PRIMARY KEY,
	"building" varchar(8) NOT NULL UNIQUE,
	"reason" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
