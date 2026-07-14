import "server-only";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { isEffective, todayIso } from "@/lib/date";
import type {
  CoupangTables,
  PromoContext,
  Scenario,
  SizeRule,
  SizeType,
} from "@/lib/calc";
import type { ScenarioAssumption } from "@/lib/calc/scenario";

const num = (v: string | number | null | undefined, d = 0): number =>
  v === null || v === undefined || v === "" ? d : Number(v);

/** as-of 시점 유효한 사이즈 규칙 (fee_size_rule) — 없으면 빈 배열(graceful) */
export async function resolveSizeRules(asOf: string): Promise<SizeRule[]> {
  const rows = await db.select().from(schema.feeSizeRule);
  return rows
    .filter((r) => isEffective({ effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo }, asOf))
    .map((r) => ({
      sizeType: r.sizeType,
      maxDimensionSumMm: r.maxDimensionSumMm,
      maxWeightG: r.maxWeightG,
      volumetricDivisor: r.volumetricDivisor,
      sortOrder: r.sortOrder,
    }));
}

/** 사이즈별 물류비 맵 (as-of, 판매가 구간은 여기선 전체구간만 — 간이) */
export async function resolveLogisticsBySize(
  asOf: string
): Promise<Partial<Record<SizeType, { inboundFee: number; shippingFee: number }>>> {
  const rows = await db
    .select()
    .from(schema.feeLogistics)
    .where(isNull(schema.feeLogistics.effectiveTo));
  const map: Partial<Record<SizeType, { inboundFee: number; shippingFee: number }>> = {};
  for (const r of rows) {
    if (!isEffective({ effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo }, asOf)) continue;
    // 같은 사이즈 중복시 먼저 것 유지 (전체구간 우선 가정)
    if (!map[r.sizeType]) map[r.sizeType] = { inboundFee: r.inboundFee, shippingFee: r.shippingFee };
  }
  return map;
}

/** 기타 수수료 맵 */
export async function resolveMisc(asOf: string): Promise<CoupangTables["misc"]> {
  const rows = await db.select().from(schema.feeMisc).where(isNull(schema.feeMisc.effectiveTo));
  const misc: CoupangTables["misc"] = {};
  for (const r of rows) {
    if (!isEffective({ effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo }, asOf)) continue;
    misc[r.feeKey] = {
      amount: r.amount === null ? null : Number(r.amount),
      freeQuota: r.freeQuota,
      freeDays: r.freeDays,
    };
  }
  return misc;
}

/** 카테고리 요율 (product.categoryId 기준, as-of 유효 버전) */
export async function resolveCategory(
  categoryId: number | null,
  asOf: string
): Promise<{ commissionRatePct: number; serviceFeeThreshold: number | null; verified: boolean } | null> {
  if (!categoryId) return null;
  const row = await db.query.feeCategory.findFirst({
    where: (t, { eq: e }) => e(t.id, categoryId),
  });
  if (!row) return null;
  return {
    commissionRatePct: Number(row.commissionRate),
    serviceFeeThreshold: row.serviceFeeThreshold,
    verified: row.isVerified,
  };
}

/** 활성 프로모션 컨텍스트 (신규 90일 기준) */
export async function resolvePromoContext(
  asOf: string,
  saverEnabled: boolean,
  applyPromo: boolean,
  cumulativeRevenue = 0
): Promise<PromoContext> {
  if (!applyPromo) return { asOfDate: asOf, saverEnabled, promo: null };
  const promo = await db.query.promotion.findFirst({
    where: (t, { eq: e, and: a }) => a(e(t.isActive, true), e(t.promoKey, "rg_zerocost_new")),
  });
  return {
    asOfDate: asOf,
    saverEnabled,
    promo: promo
      ? {
          promoKey: promo.promoKey,
          waives: (promo.waives as string[]) ?? [],
          capDays: promo.capDays,
          capAmount: promo.capAmount === null ? null : Number(promo.capAmount),
          myStartDate: promo.myStartDate,
          cumulativeRevenue,
        }
      : null,
  };
}

/** 가정값 해석: product_id > category_major > _DEFAULT (스펙 §3 assumption) */
export async function resolveAssumptions(
  productId: number | null,
  categoryMajor: string | null
): Promise<Record<Scenario, ScenarioAssumption>> {
  const rows = await db
    .select()
    .from(schema.assumption)
    .where(
      or(
        productId ? eq(schema.assumption.productId, productId) : undefined,
        categoryMajor ? eq(schema.assumption.categoryMajor, categoryMajor) : undefined,
        and(isNull(schema.assumption.productId), isNull(schema.assumption.categoryMajor))
      )
    );

  const pick = (scenario: Scenario): ScenarioAssumption => {
    const byProduct = rows.find((r) => r.productId === productId && r.scenario === scenario);
    const byCat = rows.find(
      (r) => r.productId === null && r.categoryMajor === categoryMajor && r.scenario === scenario
    );
    const byDefault = rows.find(
      (r) => r.productId === null && r.categoryMajor === null && r.scenario === scenario
    );
    const r = byProduct ?? byCat ?? byDefault;
    return {
      returnRate: num(r?.returnRate, 10),
      defectRate: num(r?.defectRate, 3),
      targetRoas: r?.targetRoas ?? 300,
      adCostRatio: r?.adCostRatio === null || r?.adCostRatio === undefined ? null : Number(r.adCostRatio),
      avgStorageDays: r?.avgStorageDays ?? 45,
      monthlySalesQty: r?.monthlySalesQty ?? 80,
    };
  };

  return { optimistic: pick("optimistic"), base: pick("base"), pessimistic: pick("pessimistic") };
}

/** 상품의 대표 착지원가 — 최신 로트의 landed_cost_per_unit (없으면 null) */
export async function resolveLandedCost(productId: number): Promise<number | null> {
  const lot = await db.query.lot.findFirst({
    where: (t, { eq: e }) => e(t.productId, productId),
    orderBy: (t) => [desc(t.createdAt)],
  });
  if (!lot || lot.landedCostPerUnit === null) return null;
  return Number(lot.landedCostPerUnit);
}

/** CoupangTables 조립 (특정 사이즈 물류비 포함) */
export async function buildCoupangTables(
  categoryId: number | null,
  sizeType: SizeType | null,
  asOf: string
): Promise<{ tables: CoupangTables; categoryVerified: boolean }> {
  const cat = await resolveCategory(categoryId, asOf);
  const logisticsMap = await resolveLogisticsBySize(asOf);
  const misc = await resolveMisc(asOf);
  return {
    tables: {
      commissionRatePct: cat?.commissionRatePct ?? 10.5,
      serviceFeeThreshold: cat?.serviceFeeThreshold ?? 1_000_000,
      logistics: sizeType ? logisticsMap[sizeType] ?? null : null,
      misc,
      serviceFeeAmount: Number(misc["service_fee"]?.amount ?? 55000),
    },
    categoryVerified: cat?.verified ?? false,
  };
}

export { todayIso };
