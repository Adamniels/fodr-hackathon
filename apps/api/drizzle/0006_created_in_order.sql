ALTER TABLE "horses" ALTER COLUMN "created_at" SET DEFAULT clock_timestamp();--> statement-breakpoint
ALTER TABLE "journal_entries" ALTER COLUMN "created_at" SET DEFAULT clock_timestamp();