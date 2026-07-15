CREATE TYPE "public"."allocation_basis" AS ENUM('amount', 'cbm', 'weight', 'qty');--> statement-breakpoint
CREATE TYPE "public"."fee_unit" AS ENUM('per_day_per_unit', 'per_item', 'per_qty', 'per_month', 'per_case', 'rate');--> statement-breakpoint
CREATE TYPE "public"."fx_rate_type" AS ENUM('customs', 'agent', 'bank');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('검토중', '발주', '판매중', '중단');--> statement-breakpoint
CREATE TYPE "public"."scenario" AS ENUM('optimistic', 'base', 'pessimistic');--> statement-breakpoint
CREATE TYPE "public"."shipping_mode" AS ENUM('air', 'lcl', 'fcl');--> statement-breakpoint
CREATE TYPE "public"."size_type" AS ENUM('XS', 'S', 'M', 'L1', 'L2', 'XL');--> statement-breakpoint
CREATE TABLE "assumption" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer,
	"category_major" text,
	"scenario" "scenario" NOT NULL,
	"return_rate" numeric(5, 2),
	"defect_rate" numeric(5, 2),
	"sell_through_rate" numeric(5, 2),
	"target_roas" integer,
	"ad_cost_ratio" numeric(5, 2),
	"avg_storage_days" integer,
	"monthly_sales_qty" integer,
	"is_estimate" boolean DEFAULT true NOT NULL,
	"data_source" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_category" (
	"id" serial PRIMARY KEY NOT NULL,
	"major" text NOT NULL,
	"middle" text,
	"minor" text,
	"commission_rate" numeric(4, 2) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"rg_eligible" boolean DEFAULT true NOT NULL,
	"service_fee_threshold" integer,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"is_verified" boolean DEFAULT false NOT NULL,
	"source" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_logistics" (
	"id" serial PRIMARY KEY NOT NULL,
	"size_type" "size_type" NOT NULL,
	"category_group" text,
	"price_min" integer,
	"price_max" integer,
	"inbound_fee" integer NOT NULL,
	"shipping_fee" integer NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"is_verified" boolean DEFAULT false NOT NULL,
	"source" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_misc" (
	"id" serial PRIMARY KEY NOT NULL,
	"fee_key" text NOT NULL,
	"fee_name_ko" text NOT NULL,
	"unit" "fee_unit" NOT NULL,
	"amount" numeric(12, 2),
	"free_quota" integer,
	"free_days" integer,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"is_verified" boolean DEFAULT false NOT NULL,
	"note" text,
	"source" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_size_rule" (
	"id" serial PRIMARY KEY NOT NULL,
	"size_type" "size_type" NOT NULL,
	"max_dimension_sum_mm" integer,
	"max_weight_g" integer,
	"volumetric_divisor" integer DEFAULT 6000 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"is_verified" boolean DEFAULT false NOT NULL,
	"source" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_rate" (
	"id" serial PRIMARY KEY NOT NULL,
	"currency" text NOT NULL,
	"rate" numeric(10, 4) NOT NULL,
	"rate_type" "fx_rate_type" NOT NULL,
	"rate_date" date NOT NULL,
	"source" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hs_code" (
	"id" serial PRIMARY KEY NOT NULL,
	"hs_code" text NOT NULL,
	"description" text,
	"tariff_rate" numeric(5, 2),
	"fta_applicable" boolean DEFAULT false NOT NULL,
	"fta_rate" numeric(5, 2),
	"cert_required" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"is_verified" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lot" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"lot_group_id" integer,
	"lot_no" text,
	"order_qty" integer NOT NULL,
	"unit_price_cny" numeric(12, 2),
	"cn_inland_cny" numeric(12, 2),
	"agent_fee_rate" numeric(5, 4),
	"card_fee_rate" numeric(5, 4),
	"fx_rate_agent" numeric(10, 4),
	"fx_rate_customs" numeric(10, 4),
	"shipping_mode" "shipping_mode",
	"shipping_cost_direct" numeric(14, 2),
	"allocated_shipping_cost" numeric(14, 2),
	"tariff_rate" numeric(5, 2),
	"tariff_amount" numeric(14, 2),
	"import_vat" numeric(14, 2),
	"customs_fee" numeric(12, 2),
	"bl_fee" numeric(12, 2),
	"handling_fee" numeric(12, 2),
	"domestic_ship_fee" numeric(12, 2),
	"inspection_fee" numeric(12, 2),
	"barcode_fee" numeric(12, 2),
	"order_date" date,
	"paid_date" date,
	"arrive_date" date,
	"inbound_date" date,
	"landed_cost_per_unit" numeric(14, 4),
	"calc_snapshot" jsonb,
	"status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lot_group" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"shipping_mode" "shipping_mode",
	"shipping_cost_total" numeric(14, 2),
	"customs_fee_total" numeric(14, 2),
	"allocation_basis" "allocation_basis" DEFAULT 'cbm' NOT NULL,
	"ship_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_plan" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"list_price" numeric(12, 2),
	"coupon_amount" numeric(12, 2),
	"final_price" numeric(12, 2),
	"saver_enabled" boolean DEFAULT false NOT NULL,
	"promo_applied" boolean DEFAULT false NOT NULL,
	"calc_snapshot" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"memo" text,
	"status" "product_status" DEFAULT '검토중' NOT NULL,
	"source_url" text,
	"source_offer_id" text,
	"source_supplier" text,
	"source_snapshot" jsonb,
	"image_url" text,
	"image_urls" jsonb DEFAULT '[]'::jsonb,
	"category_id" integer,
	"hs_code_id" integer,
	"unit_w_mm" integer,
	"unit_d_mm" integer,
	"unit_h_mm" integer,
	"unit_weight_g" integer,
	"pkg_w_mm" integer,
	"pkg_d_mm" integer,
	"pkg_h_mm" integer,
	"pkg_weight_g" integer,
	"size_type_cached" "size_type",
	"set_qty" integer DEFAULT 1 NOT NULL,
	"return_resalable" boolean DEFAULT true NOT NULL,
	"cert_cost_total" numeric(12, 2),
	"cert_expected_qty" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotion" (
	"id" serial PRIMARY KEY NOT NULL,
	"promo_key" text NOT NULL,
	"name" text NOT NULL,
	"waives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cap_days" integer,
	"cap_amount" numeric(14, 2),
	"apply_start" date,
	"apply_end" date,
	"my_start_date" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"note" text,
	"source" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotion_promo_key_unique" UNIQUE("promo_key")
);
--> statement-breakpoint
CREATE TABLE "sales_actual" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer,
	"lot_id" integer,
	"ym" text NOT NULL,
	"sold_qty" integer,
	"gross_revenue" numeric(14, 2),
	"returned_qty" integer,
	"ad_spend" numeric(14, 2),
	"settlement_amount" numeric(14, 2)
);
--> statement-breakpoint
CREATE TABLE "settlement_raw" (
	"id" serial PRIMARY KEY NOT NULL,
	"upload_id" integer NOT NULL,
	"ym" text NOT NULL,
	"row_json" jsonb NOT NULL,
	"matched_product_id" integer
);
--> statement-breakpoint
CREATE TABLE "settlement_upload" (
	"id" serial PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"ym" text NOT NULL,
	"row_count" integer,
	"parse_status" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variance" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer,
	"ym" text NOT NULL,
	"fee_key" text NOT NULL,
	"estimated" numeric(14, 2),
	"actual" numeric(14, 2),
	"diff" numeric(14, 2),
	"diff_pct" numeric(6, 2)
);
--> statement-breakpoint
ALTER TABLE "assumption" ADD CONSTRAINT "assumption_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot" ADD CONSTRAINT "lot_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot" ADD CONSTRAINT "lot_lot_group_id_lot_group_id_fk" FOREIGN KEY ("lot_group_id") REFERENCES "public"."lot_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_plan" ADD CONSTRAINT "price_plan_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_category_id_fee_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."fee_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_hs_code_id_hs_code_id_fk" FOREIGN KEY ("hs_code_id") REFERENCES "public"."hs_code"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_actual" ADD CONSTRAINT "sales_actual_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_actual" ADD CONSTRAINT "sales_actual_lot_id_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_raw" ADD CONSTRAINT "settlement_raw_upload_id_settlement_upload_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."settlement_upload"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_raw" ADD CONSTRAINT "settlement_raw_matched_product_id_product_id_fk" FOREIGN KEY ("matched_product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variance" ADD CONSTRAINT "variance_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fee_category_major_idx" ON "fee_category" USING btree ("major");--> statement-breakpoint
CREATE INDEX "fee_category_effective_idx" ON "fee_category" USING btree ("effective_from","effective_to");--> statement-breakpoint
CREATE INDEX "fee_logistics_size_idx" ON "fee_logistics" USING btree ("size_type");--> statement-breakpoint
CREATE INDEX "fee_size_rule_sort_idx" ON "fee_size_rule" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "fx_rate_lookup_idx" ON "fx_rate" USING btree ("currency","rate_type","rate_date");--> statement-breakpoint
CREATE INDEX "lot_product_idx" ON "lot" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "lot_group_idx" ON "lot" USING btree ("lot_group_id");--> statement-breakpoint
CREATE INDEX "price_plan_product_idx" ON "price_plan" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_offer_id_idx" ON "product" USING btree ("source_offer_id");--> statement-breakpoint
CREATE INDEX "product_status_idx" ON "product" USING btree ("status");