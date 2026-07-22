CREATE TABLE IF NOT EXISTS "saved_item" (
	"id" serial PRIMARY KEY NOT NULL,
	"keyword" text NOT NULL,
	"verdict" text,
	"margin" text,
	"reason" text,
	"caution" text,
	"monthly_volume" integer,
	"comp" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_item_keyword_unique" UNIQUE("keyword")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saved_item_created_idx" ON "saved_item" USING btree ("created_at");
