import type { CoupangTables, PromoContext, SizeType } from "./types";
import { calcCoupangFees, isPromoActive } from "./coupang";
import { calcMargin, type MarginResult } from "./margin";
import type { ScenarioAssumption } from "./scenario";

export interface ComparePromoParams {
  finalPrice: number;
  landedCostPerUnit: number;
  sizeType: SizeType | null;
  asOfDate: string;
  returnResalable: boolean;
  disposalCost: number;
  assumption: ScenarioAssumption;
  tables: CoupangTables;
  promoCtx: PromoContext;
}

export interface ComparePromoResult {
  duringPromo: MarginResult;
  afterPromo: MarginResult;
  cliffAmount: number; // 개당 사라지는 순이익 (원)
  cliffMarginPoints: number; // 마진율 %p 하락
  daysRemaining: number | null;
  revenueCapRemaining: number | null; // 2억 캡까지 남은 매출
  active: boolean;
}

function marginWith(p: ComparePromoParams, ctx: PromoContext): MarginResult {
  const fees = calcCoupangFees(
    {
      finalPrice: p.finalPrice,
      sizeType: p.sizeType,
      asOfDate: p.asOfDate,
      storageDays: p.assumption.avgStorageDays,
      monthlySalesQty: p.assumption.monthlySalesQty,
    },
    p.tables,
    ctx
  );
  const adCost =
    p.assumption.adCostRatio !== null
      ? (p.finalPrice * p.assumption.adCostRatio) / 100
      : p.assumption.targetRoas
        ? p.finalPrice / (p.assumption.targetRoas / 100)
        : 0;
  return calcMargin({
    finalPrice: p.finalPrice,
    landedCostPerUnit: p.landedCostPerUnit,
    coupangFeesExVat: fees.totalExVat,
    adCostInclVat: adCost,
    returnRate: p.assumption.returnRate,
    returnResalable: p.returnResalable,
    returnPickupCost: fees.returnPickup,
    returnRestockCost: fees.returnRestock,
    disposalCost: p.disposalCost,
  });
}

/**
 * 프로모션 중/후 마진 병렬 비교 (스펙 §4 promo.ts).
 * 🔴 초보가 가장 크게 데이는 지점 — 프로모션 마진과 종료후 마진을 항상 나란히.
 */
export function comparePromoVsPost(p: ComparePromoParams): ComparePromoResult {
  const state = isPromoActive(p.promoCtx);

  // during: 프로모션 강제 활성(내 시작일이 없으면 asOfDate 로 가정)
  const duringCtx: PromoContext = {
    ...p.promoCtx,
    promo: p.promoCtx.promo
      ? { ...p.promoCtx.promo, myStartDate: p.promoCtx.promo.myStartDate ?? p.asOfDate }
      : p.promoCtx.promo,
  };
  // after: 프로모션 종료 (세이버는 유지)
  const afterCtx: PromoContext = { ...p.promoCtx, promo: null };

  const duringPromo = marginWith(p, duringCtx);
  const afterPromo = marginWith(p, afterCtx);

  const cliffAmount = duringPromo.netProfit - afterPromo.netProfit;
  const cliffMarginPoints = Math.round((duringPromo.marginRate - afterPromo.marginRate) * 10) / 10;

  let revenueCapRemaining: number | null = null;
  if (p.promoCtx.promo?.capAmount != null) {
    revenueCapRemaining = Math.max(
      0,
      p.promoCtx.promo.capAmount - (p.promoCtx.promo.cumulativeRevenue ?? 0)
    );
  }

  return {
    duringPromo,
    afterPromo,
    cliffAmount: Math.round(cliffAmount),
    cliffMarginPoints,
    daysRemaining: state.daysRemaining,
    revenueCapRemaining,
    active: state.active,
  };
}
