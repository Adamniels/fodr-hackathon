ALTER TABLE "product_versions" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "admin_managed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("users"."role" in ('user', 'admin'));