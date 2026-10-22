CREATE TABLE "product_set_members" (
	"set_id" uuid NOT NULL,
	"product_version_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "product_set_members_set_id_product_version_id_pk" PRIMARY KEY("set_id","product_version_id")
);
--> statement-breakpoint
CREATE TABLE "product_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"verified_on" date,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_set_members" ADD CONSTRAINT "product_set_members_set_id_product_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."product_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_set_members" ADD CONSTRAINT "product_set_members_product_version_id_product_versions_id_fk" FOREIGN KEY ("product_version_id") REFERENCES "public"."product_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_versions_product_id_idx" ON "product_versions" USING btree ("product_id","created_at");