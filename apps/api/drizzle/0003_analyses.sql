CREATE TABLE "analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"horse_id" uuid NOT NULL,
	"file_key" text,
	"media_type" text,
	"values" jsonb NOT NULL,
	"extracted" jsonb,
	"is_current" boolean NOT NULL,
	"sampled_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_horse_id_horses_id_fk" FOREIGN KEY ("horse_id") REFERENCES "public"."horses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analyses_horse_id_idx" ON "analyses" USING btree ("horse_id");--> statement-breakpoint
CREATE UNIQUE INDEX "analyses_one_current_per_horse" ON "analyses" USING btree ("horse_id") WHERE "analyses"."is_current";