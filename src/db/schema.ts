import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  boolean,
  numeric,
  jsonb,
  timestamp,
  date,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const sizeTypeEnum = pgEnum("size_type", ["XS", "S", "M", "L1", "L2", "XL"]);
export const feeUnitEnum = pgEnum("fee_unit", [
  "per_day_per_unit",
  "per_item",
  "per_qty",
  "per_month",
  "per_case",
  "rate",
]);
export const productStatusEnum = pgEnum("product_status", [
  "검토중",
  "발주",
  "판매중",
  "중단",
]);
export const allocationBasisEnum = pgEnum("allocation_basis", [
  "amount",
  "cbm",
  "weight",
  "qty",
]);
export const shippingModeEnum = pgEnum("shipping_mode", ["air", "lcl", "fcl"]);
export const scenarioEnum = pgEnum("scenario", ["optimistic", "base", "pessimistic"]);
export const fxRateTypeEnum = pgEnum("fx_rate_type", ["customs", "agent", "bank"]);

/* ------------------------------------------------------------------ */
/* 마스터 (버전관리)                                                    */
/* 공통: effective_from, effective_to, is_verified, source, updated_at */
/* ------------------------------------------------------------------ */

export const feeCategory = pgTable(
  "fee_category",
  {
    id: serial("id").primaryKey(),
    major: text("major").notNull(),
    middle: text("middle"),
    minor: text("minor"),
    commissionRate: numeric("commission_rate", { precision: 4, scale: 2 }).notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    // 식품/음반/도서 등은 RG 입점 불가
    rgEligible: boolean("rg_eligible").notNull().default(true),
    serviceFeeThreshold: integer("service_fee_threshold"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    isVerified: boolean("is_verified").notNull().default(false),
    source: text("source"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byMajor: index("fee_category_major_idx").on(t.major),
    byEffective: index("fee_category_effective_idx").on(t.effectiveFrom, t.effectiveTo),
  })
);

// 사이즈 판정 규칙 — 🔴 시딩 없음. 사용자가 윙에서 확인 후 입력.
export const feeSizeRule = pgTable(
  "fee_size_rule",
  {
    id: serial("id").primaryKey(),
    sizeType: sizeTypeEnum("size_type").notNull(),
    maxDimensionSumMm: integer("max_dimension_sum_mm"),
    maxWeightG: integer("max_weight_g"),
    volumetricDivisor: integer("volumetric_divisor").notNull().default(6000),
    sortOrder: integer("sort_order").notNull().default(0),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    isVerified: boolean("is_verified").notNull().default(false),
    source: text("source"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySort: index("fee_size_rule_sort_idx").on(t.sortOrder),
  })
);

// 입출고비/배송비 매트릭스 (사이즈 × 카테고리군 × 판매가 구간)
export const feeLogistics = pgTable(
  "fee_logistics",
  {
    id: serial("id").primaryKey(),
    sizeType: sizeTypeEnum("size_type").notNull(),
    categoryGroup: text("category_group"), // null = 전체
    priceMin: integer("price_min"), // 판매가 구간 하한 (null=무제한)
    priceMax: integer("price_max"), // 판매가 구간 상한 (null=무제한)
    inboundFee: integer("inbound_fee").notNull(),
    shippingFee: integer("shipping_fee").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    isVerified: boolean("is_verified").notNull().default(false),
    source: text("source"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySize: index("fee_logistics_size_idx").on(t.sizeType),
  })
);

export const feeMisc = pgTable("fee_misc", {
  id: serial("id").primaryKey(),
  feeKey: text("fee_key").notNull(),
  feeNameKo: text("fee_name_ko").notNull(),
  unit: feeUnitEnum("unit").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }), // nullable=미확인
  freeQuota: integer("free_quota"),
  freeDays: integer("free_days"),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  isVerified: boolean("is_verified").notNull().default(false),
  note: text("note"),
  source: text("source"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const promotion = pgTable("promotion", {
  id: serial("id").primaryKey(),
  promoKey: text("promo_key").notNull().unique(),
  name: text("name").notNull(),
  // 면제되는 fee_key 배열
  waives: jsonb("waives").$type<string[]>().notNull().default([]),
  capDays: integer("cap_days"),
  capAmount: numeric("cap_amount", { precision: 14, scale: 2 }),
  applyStart: date("apply_start"), // 신청 가능 기간
  applyEnd: date("apply_end"),
  // 🔴 내가 실제 시작한 날 (D-day 계산 기준)
  myStartDate: date("my_start_date"),
  isActive: boolean("is_active").notNull().default(true),
  note: text("note"),
  source: text("source"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fxRate = pgTable(
  "fx_rate",
  {
    id: serial("id").primaryKey(),
    currency: text("currency").notNull(), // CNY, USD ...
    rate: numeric("rate", { precision: 10, scale: 4 }).notNull(),
    rateType: fxRateTypeEnum("rate_type").notNull(),
    rateDate: date("rate_date").notNull(),
    source: text("source"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byLookup: index("fx_rate_lookup_idx").on(t.currency, t.rateType, t.rateDate),
  })
);

export const hsCode = pgTable("hs_code", {
  id: serial("id").primaryKey(),
  hsCode: text("hs_code").notNull(),
  description: text("description"),
  tariffRate: numeric("tariff_rate", { precision: 5, scale: 2 }),
  ftaApplicable: boolean("fta_applicable").notNull().default(false),
  ftaRate: numeric("fta_rate", { precision: 5, scale: 2 }),
  certRequired: jsonb("cert_required").$type<string[]>().notNull().default([]),
  note: text("note"),
  isVerified: boolean("is_verified").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* 운영                                                                 */
/* ------------------------------------------------------------------ */

export const product = pgTable(
  "product",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    memo: text("memo"),
    status: productStatusEnum("status").notNull().default("검토중"),

    sourceUrl: text("source_url"), // 1688 원본 URL
    sourceOfferId: text("source_offer_id"), // URL에서 파싱, unique
    sourceSupplier: text("source_supplier"),
    sourceSnapshot: jsonb("source_snapshot"), // 북마클릿 수집 원문
    imageUrl: text("image_url"),
    imageUrls: jsonb("image_urls").$type<string[]>().default([]),

    categoryId: integer("category_id").references(() => feeCategory.id),
    hsCodeId: integer("hs_code_id").references(() => hsCode.id),

    // 낱개 실측
    unitWMm: integer("unit_w_mm"),
    unitDMm: integer("unit_d_mm"),
    unitHMm: integer("unit_h_mm"),
    unitWeightG: integer("unit_weight_g"),
    // 🔴 포장 후 = 실제 과금 기준
    pkgWMm: integer("pkg_w_mm"),
    pkgDMm: integer("pkg_d_mm"),
    pkgHMm: integer("pkg_h_mm"),
    pkgWeightG: integer("pkg_weight_g"),
    sizeTypeCached: sizeTypeEnum("size_type_cached"),

    setQty: integer("set_qty").notNull().default(1), // 세트 구성 족수
    // 🔴 false면 반품=원가 전손 (양말 등 위생용품)
    returnResalable: boolean("return_resalable").notNull().default(true),
    certCostTotal: numeric("cert_cost_total", { precision: 12, scale: 2 }),
    certExpectedQty: integer("cert_expected_qty"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byOfferId: uniqueIndex("product_offer_id_idx").on(t.sourceOfferId),
    byStatus: index("product_status_idx").on(t.status),
  })
);

// 컨테이너 단위 공통비
export const lotGroup = pgTable("lot_group", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  shippingMode: shippingModeEnum("shipping_mode"),
  shippingCostTotal: numeric("shipping_cost_total", { precision: 14, scale: 2 }),
  customsFeeTotal: numeric("customs_fee_total", { precision: 14, scale: 2 }),
  allocationBasis: allocationBasisEnum("allocation_basis").notNull().default("cbm"),
  shipDate: date("ship_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const lot = pgTable(
  "lot",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    lotGroupId: integer("lot_group_id").references(() => lotGroup.id),
    lotNo: text("lot_no"),
    orderQty: integer("order_qty").notNull(),

    unitPriceCny: numeric("unit_price_cny", { precision: 12, scale: 2 }),
    cnInlandCny: numeric("cn_inland_cny", { precision: 12, scale: 2 }),
    agentFeeRate: numeric("agent_fee_rate", { precision: 5, scale: 4 }),
    cardFeeRate: numeric("card_fee_rate", { precision: 5, scale: 4 }),
    fxRateAgent: numeric("fx_rate_agent", { precision: 10, scale: 4 }),
    fxRateCustoms: numeric("fx_rate_customs", { precision: 10, scale: 4 }),

    shippingMode: shippingModeEnum("shipping_mode"),
    shippingCostDirect: numeric("shipping_cost_direct", { precision: 14, scale: 2 }),
    allocatedShippingCost: numeric("allocated_shipping_cost", { precision: 14, scale: 2 }),

    tariffRate: numeric("tariff_rate", { precision: 5, scale: 2 }),
    tariffAmount: numeric("tariff_amount", { precision: 14, scale: 2 }),
    importVat: numeric("import_vat", { precision: 14, scale: 2 }),
    customsFee: numeric("customs_fee", { precision: 12, scale: 2 }),
    blFee: numeric("bl_fee", { precision: 12, scale: 2 }),
    handlingFee: numeric("handling_fee", { precision: 12, scale: 2 }),
    domesticShipFee: numeric("domestic_ship_fee", { precision: 12, scale: 2 }),
    inspectionFee: numeric("inspection_fee", { precision: 12, scale: 2 }),
    barcodeFee: numeric("barcode_fee", { precision: 12, scale: 2 }),

    // 캐시플로우
    orderDate: date("order_date"),
    paidDate: date("paid_date"),
    arriveDate: date("arrive_date"),
    inboundDate: date("inbound_date"),

    landedCostPerUnit: numeric("landed_cost_per_unit", { precision: 14, scale: 4 }),
    calcSnapshot: jsonb("calc_snapshot"),

    status: text("status"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byProduct: index("lot_product_idx").on(t.productId),
    byGroup: index("lot_group_idx").on(t.lotGroupId),
  })
);

// 해석 우선순위: product_id 지정 > category_major 매칭 > _DEFAULT
export const assumption = pgTable("assumption", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => product.id, { onDelete: "cascade" }),
  categoryMajor: text("category_major"), // 둘다 null이면 _DEFAULT
  scenario: scenarioEnum("scenario").notNull(),
  returnRate: numeric("return_rate", { precision: 5, scale: 2 }),
  defectRate: numeric("defect_rate", { precision: 5, scale: 2 }),
  sellThroughRate: numeric("sell_through_rate", { precision: 5, scale: 2 }),
  targetRoas: integer("target_roas"),
  adCostRatio: numeric("ad_cost_ratio", { precision: 5, scale: 2 }),
  avgStorageDays: integer("avg_storage_days"),
  monthlySalesQty: integer("monthly_sales_qty"),
  isEstimate: boolean("is_estimate").notNull().default(true),
  dataSource: text("data_source"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pricePlan = pgTable(
  "price_plan",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    listPrice: numeric("list_price", { precision: 12, scale: 2 }),
    couponAmount: numeric("coupon_amount", { precision: 12, scale: 2 }),
    finalPrice: numeric("final_price", { precision: 12, scale: 2 }), // 수수료 기준가
    saverEnabled: boolean("saver_enabled").notNull().default(false),
    promoApplied: boolean("promo_applied").notNull().default(false),
    calcSnapshot: jsonb("calc_snapshot"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byProduct: index("price_plan_product_idx").on(t.productId),
  })
);

/* ------------------------------------------------------------------ */
/* 상품 리서치 — 쿠팡 검색결과 수집 스냅샷 (경쟁분석 · 판매량 추정)          */
/* ------------------------------------------------------------------ */

export const coupangSnapshot = pgTable(
  "coupang_snapshot",
  {
    id: serial("id").primaryKey(),
    keyword: text("keyword").notNull(),
    productId: text("product_id"), // 쿠팡 상품 id
    name: text("name"),
    price: integer("price"),
    rating: numeric("rating", { precision: 3, scale: 2 }),
    reviewCount: integer("review_count"),
    isRocket: boolean("is_rocket").notNull().default(false),
    isPb: boolean("is_pb").notNull().default(false), // 쿠팡 PB(코멧 등)
    rank: integer("rank"),
    collectedAt: timestamp("collected_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byKeyword: index("coupang_snapshot_keyword_idx").on(t.keyword),
    byProduct: index("coupang_snapshot_product_idx").on(t.productId),
  })
);

// 상품찾기 → "아이템 저장" 후보 리스트 (DB 저장 → 기기 간 동기화)
export const savedItem = pgTable(
  "saved_item",
  {
    id: serial("id").primaryKey(),
    keyword: text("keyword").notNull().unique(),
    verdict: text("verdict"),
    margin: text("margin"),
    reason: text("reason"),
    caution: text("caution"),
    monthlyVolume: integer("monthly_volume"),
    comp: text("comp"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byCreated: index("saved_item_created_idx").on(t.createdAt),
  })
);

/* ------------------------------------------------------------------ */
/* Phase 2 (스키마만 미리 생성)                                          */
/* ------------------------------------------------------------------ */

export const settlementUpload = pgTable("settlement_upload", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  ym: text("ym").notNull(), // YYYY-MM
  rowCount: integer("row_count"),
  parseStatus: text("parse_status"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const settlementRaw = pgTable("settlement_raw", {
  id: serial("id").primaryKey(),
  uploadId: integer("upload_id")
    .notNull()
    .references(() => settlementUpload.id, { onDelete: "cascade" }),
  ym: text("ym").notNull(),
  rowJson: jsonb("row_json").notNull(),
  matchedProductId: integer("matched_product_id").references(() => product.id),
});

export const salesActual = pgTable("sales_actual", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => product.id),
  lotId: integer("lot_id").references(() => lot.id),
  ym: text("ym").notNull(),
  soldQty: integer("sold_qty"),
  grossRevenue: numeric("gross_revenue", { precision: 14, scale: 2 }),
  returnedQty: integer("returned_qty"),
  adSpend: numeric("ad_spend", { precision: 14, scale: 2 }),
  settlementAmount: numeric("settlement_amount", { precision: 14, scale: 2 }),
});

export const variance = pgTable("variance", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => product.id),
  ym: text("ym").notNull(),
  feeKey: text("fee_key").notNull(),
  estimated: numeric("estimated", { precision: 14, scale: 2 }),
  actual: numeric("actual", { precision: 14, scale: 2 }),
  diff: numeric("diff", { precision: 14, scale: 2 }),
  diffPct: numeric("diff_pct", { precision: 6, scale: 2 }),
});

/* ------------------------------------------------------------------ */
/* 타입 export                                                          */
/* ------------------------------------------------------------------ */

export type FeeCategory = typeof feeCategory.$inferSelect;
export type FeeSizeRule = typeof feeSizeRule.$inferSelect;
export type FeeLogistics = typeof feeLogistics.$inferSelect;
export type FeeMisc = typeof feeMisc.$inferSelect;
export type Promotion = typeof promotion.$inferSelect;
export type FxRate = typeof fxRate.$inferSelect;
export type HsCode = typeof hsCode.$inferSelect;
export type Product = typeof product.$inferSelect;
export type LotGroup = typeof lotGroup.$inferSelect;
export type Lot = typeof lot.$inferSelect;
export type Assumption = typeof assumption.$inferSelect;
export type PricePlan = typeof pricePlan.$inferSelect;
export type CoupangSnapshot = typeof coupangSnapshot.$inferSelect;
export type SavedItem = typeof savedItem.$inferSelect;
