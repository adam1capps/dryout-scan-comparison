ALTER TABLE "proposed_vents" ADD COLUMN "category" varchar(32);--> statement-breakpoint
ALTER TABLE "proposed_vents" ADD COLUMN "note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "proposed_vents" ADD COLUMN "additional_sf" integer;--> statement-breakpoint
ALTER TABLE "proposed_vents" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;