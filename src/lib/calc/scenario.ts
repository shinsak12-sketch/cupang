import type { CoupangTables, PromoContext, Scenario, SizeType, Verdict } from "./types";
import { calcCoupangFees, type CoupangFeeResult } from "./coupang";
import { calcMargin, type MarginResult } from "./margin";

export interface ScenarioAssumption {
  returnRate: number;
  defectRate: number;
  targetRoas: number | null;
  adCostRatio: number | null; // % (있으면 우선)
  avgStorageDays: number;
  monthlySalesQty: number;
}

export interface ScenarioParams {
  finalPrice: number;
  landedCostPerUnit: number;
  sizeType: SizeType | null;
  asOfDate: string;
  returnResalable: boolean;
  disposalCost: number;
  fixedCost?: number;
  tables: CoupangTables;
  promoCtx: PromoContext;
  assumptions: Record<Scenario, ScenarioAssumption>;
}

export interface ScenarioOutcome extends MarginResult {
  fees: CoupangFeeResult;
  adCostInclVat: number;
}

export interface ScenarioResult {
  optimistic: ScenarioOutcome;
  base: ScenarioOutcome;
  pessimistic: ScenarioOutcome;
  verdict: Verdict;
  verdictReason: string;
}

function adCostOf(finalPrice: number, a: ScenarioAssumption): number {
  if (a.adCostRatio !== null) return (finalPrice * a.adCostRatio) / 100;
  if (a.targetRoas && a.targetRoas > 0) return finalPrice / (a.targetRoas / 100);
  return 0;
}

function runOne(p: ScenarioParams, a: ScenarioAssumption): ScenarioOutcome {
  const fees = calcCoupangFees(
    {
      finalPrice: p.finalPrice,
      sizeType: p.sizeType,
      asOfDate: p.asOfDate,
      storageDays: a.avgStorageDays,
      monthlySalesQty: a.monthlySalesQty,
    },
    p.tables,
    p.promoCtx
  );
  const adCostInclVat = adCostOf(p.finalPrice, a);
  const margin = calcMargin({
    finalPrice: p.finalPrice,
    landedCostPerUnit: p.landedCostPerUnit,
    coupangFeesExVat: fees.totalExVat,
    adCostInclVat,
    returnRate: a.returnRate,
    returnResalable: p.returnResalable,
    returnPickupCost: fees.returnPickup,
    returnRestockCost: fees.returnRestock,
    disposalCost: p.disposalCost,
    fixedCost: p.fixedCost,
  });
  return { ...margin, fees, adCostInclVat };
}

/**
 * 3시나리오 마진 + GO/CAUTION/NO-GO 판정 (스펙 §4 scenario.ts).
 * 🔴 판정 규칙: 비관 순이익 < 0 → NO-GO. 기준 마진율 < 15% → CAUTION. 그 외 GO.
 */
export function calcScenarios(p: ScenarioParams): ScenarioResult {
  const optimistic = runOne(p, p.assumptions.optimistic);
  const base = runOne(p, p.assumptions.base);
  const pessimistic = runOne(p, p.assumptions.pessimistic);

  let verdict: Verdict;
  let verdictReason: string;
  if (pessimistic.netProfit < 0) {
    verdict = "NO-GO";
    verdictReason = `비관 시나리오 순이익 ${pessimistic.netProfit.toLocaleString("ko-KR")}원 (< 0)`;
  } else if (base.marginRate < 15) {
    verdict = "CAUTION";
    verdictReason = `기준 마진율 ${base.marginRate}% (< 15%)`;
  } else {
    verdict = "GO";
    verdictReason = `기준 마진율 ${base.marginRate}%, 비관도 흑자`;
  }

  return { optimistic, base, pessimistic, verdict, verdictReason };
}
