ALTER TABLE "ai_usage" DROP CONSTRAINT "ai_usage_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_usage" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;