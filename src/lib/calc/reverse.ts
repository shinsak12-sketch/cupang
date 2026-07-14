import type { CoupangTables, PromoContext, SizeType } from "./types";
import { calcCoupangFees } from "./coupang";
import { calcMargin } from "./margin";
import type { ScenarioAssumption } from "./scenario";

export interface ReverseParams {
  targetMarginRate: number; // % 목표
  landedCostPerUnit: number;
  sizeType: SizeType | null;
  asOfDate: string;
  returnResalable: boolean;
  disposalCost: number;
  assumption: ScenarioAssumption;
  tables: CoupangTables;
  promoCtx: PromoContext;
}

function marginRateAtPrice(p: ReverseParams, finalPrice: number): number {
  const fees = calcCoupangFees(
    {
      finalPrice,
      sizeType: p.sizeType,
      asOfDate: p.asOfDate,
      storageDays: p.assumption.avgStorageDays,
      monthlySalesQty: p.assumption.monthlySalesQty,
    },
    p.tables,
    p.promoCtx
  );
  const adCost =
    p.assumption.adCostRatio !== null
      ? (finalPrice * p.assumption.adCostRatio) / 100
      : p.assumption.targetRoas
        ? finalPrice / (p.assumption.targetRoas / 100)
        : 0;
  const m = calcMargin({
    finalPrice,
    landedCostPerUnit: p.landedCostPerUnit,
    coupangFeesExVat: fees.totalExVat,
    adCostInclVat: adCost,
    returnRate: p.assumption.returnRate,
    returnResalable: p.returnResalable,
    returnPickupCost: fees.returnPickup,
    returnRestockCost: fees.returnRestock,
    disposalCost: p.disposalCost,
  });
  return m.marginRate;
}

/**
 * 역산: "목표 마진 X% 맞추려면 얼마?" (스펙 §4 reverse.ts).
 * 사이즈 물류비가 가격구간 의존이라 비선형 가능 → 이분탐색.
 */
export function reversePrice(p: ReverseParams): {
  requiredPrice: number;
  achievedMarginRate: number;
  feasible: boolean;
} {
  let lo = Math.max(100, p.landedCostPerUnit); // 원가 이하로는 무의미
  let hi = Math.max(lo * 20, 1_000_000);

  // 상한에서도 목표 미달이면 불가
  if (marginRateAtPrice(p, hi) < p.targetMarginRate) {
    return {
      requiredPrice: Math.round(hi),
      achievedMarginRate: Math.round(marginRateAtPrice(p, hi) * 10) / 10,
      feasible: false,
    };
  }

  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (marginRateAtPrice(p, mid) < p.targetMarginRate) lo = mid;
    else hi = mid;
  }
  const requiredPrice = Math.ceil(hi / 10) * 10; // 10원 단위 반올림
  return {
    requiredPrice,
    achievedMarginRate: Math.round(marginRateAtPrice(p, requiredPrice) * 10) / 10,
    feasible: true,
  };
}
