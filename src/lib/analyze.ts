import "server-only";
import { db } from "@/db";
import {
  resolveSizeRules,
  resolveAssumptions,
  resolvePromoContext,
  resolveLandedCost,
  buildCoupangTables,
} from "@/lib/resolve";
import {
  resolveSize,
  calcScenarios,
  comparePromoVsPost,
  type ScenarioResult,
  type SizeResult,
} from "@/lib/calc";
import type { ComparePromoResult } from "@/lib/calc/promo";
import { todayIso } from "@/lib/date";

export interface AnalyzeOptions {
  finalPrice: number;
  landedCostPerUnit?: number | null;
  saverEnabled?: boolean;
  promoApplied?: boolean;
  asOfDate?: string;
  cumulativeRevenue?: number;
  disposalCost?: number;
}

export interface AnalyzeResult {
  asOf: string;
  size: SizeResult;
  landedCostPerUnit: number;
  landedSource: "override" | "lot" | "none";
  scenarios: ScenarioResult;
  promoCompare: ComparePromoResult | null;
  flags: {
    categoryVerified: boolean;
    logisticsConfigured: boolean;
    sizeRulesConfigured: boolean;
    returnResalable: boolean;
  };
}

/**
 * 상품 종합 분석 (사이즈 → 3시나리오 판정 → 프로모션 전후). analyze 라우트와 compare 가 공유.
 */
export async function analyzeProduct(
  productId: number,
  opts: AnalyzeOptions
): Promise<AnalyzeResult | null> {
  const asOf = opts.asOfDate ?? todayIso();
  const product = await db.query.product.findFirst({
    where: (t, { eq }) => eq(t.id, productId),
  });
  if (!product) return null;

  const category = product.categoryId
    ? await db.query.feeCategory.findFirst({ where: (t, { eq }) => eq(t.id, product.categoryId!) })
    : null;

  const rules = await resolveSizeRules(asOf);
  const size = resolveSize(
    { wMm: product.pkgWMm ?? 0, dMm: product.pkgDMm ?? 0, hMm: product.pkgHMm ?? 0 },
    product.pkgWeightG ?? 0,
    rules
  );

  const { tables, categoryVerified } = await buildCoupangTables(
    product.categoryId,
    size.sizeType,
    asOf
  );
  const assumptions = await resolveAssumptions(productId, category?.major ?? null);
  const promoCtx = await resolvePromoContext(
    asOf,
    opts.saverEnabled ?? false,
    opts.promoApplied ?? false,
    opts.cumulativeRevenue ?? 0
  );

  const landedFromLot = await resolveLandedCost(productId);
  const landedCostPerUnit = opts.landedCostPerUnit ?? landedFromLot ?? 0;
  const disposalCost = opts.disposalCost ?? 0;

  const scenarios = calcScenarios({
    finalPrice: opts.finalPrice,
    landedCostPerUnit,
    sizeType: size.sizeType,
    asOfDate: asOf,
    returnResalable: product.returnResalable,
    disposalCost,
    tables,
    promoCtx,
    assumptions,
  });

  const promoCompare = promoCtx.promo
    ? comparePromoVsPost({
        finalPrice: opts.finalPrice,
        landedCostPerUnit,
        sizeType: size.sizeType,
        asOfDate: asOf,
        returnResalable: product.returnResalable,
        disposalCost,
        assumption: assumptions.base,
        tables,
        promoCtx,
      })
    : null;

  return {
    asOf,
    size,
    landedCostPerUnit,
    landedSource:
      opts.landedCostPerUnit != null ? "override" : landedFromLot != null ? "lot" : "none",
    scenarios,
    promoCompare,
    flags: {
      categoryVerified,
      logisticsConfigured: tables.logistics !== null,
      sizeRulesConfigured: size.rulesConfigured,
      returnResalable: product.returnResalable,
    },
  };
}
