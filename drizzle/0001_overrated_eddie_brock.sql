CREATE TABLE "coupang_snapshot" (
	"id" serial PRIMARY KEY NOT NULL,
	"keyword" text NOT NULL,
	"product_id" text,
	"name" text,
	"price" integer,
	"rating" numeric(3, 2),
	"review_count" integer,
	"is_rocket" boolean DEFAULT false NOT NULL,
	"is_pb" boolean DEFAULT false NOT NULL,
	"rank" integer,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "coupang_snapshot_keyword_idx" ON "coupang_snapshot" USING btree ("keyword");--> statement-breakpoint
CREATE INDEX "coupang_snapshot_product_idx" ON "coupang_snapshot" USING btree ("product_id");