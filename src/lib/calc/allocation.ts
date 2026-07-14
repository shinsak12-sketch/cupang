import type { AllocationBasis } from "./types";

export interface AllocLot {
  id: number;
  amount: number; // 사입 금액 (KRW 또는 CNY 일관되게)
  cbm: number; // 부피 m³ (pkg 부피 × 수량)
  weightG: number; // 총 중량 g
  qty: number; // 수량
}

/**
 * 공통비(국제운송+통관) 배분 (스펙 §4 allocation.ts).
 * 🔴 기본 배분기준 = cbm(부피). 금액비례로 나누면 부피 큰 저가품 마진을 착각함.
 * 반환: lotId → 배분액. 합계는 totalCost 와 일치(반올림 오차는 마지막 로트에 흡수).
 */
export function allocateCommonCost(
  totalCost: number,
  lots: AllocLot[],
  basis: AllocationBasis = "cbm"
): Map<number, number> {
  const result = new Map<number, number>();
  if (lots.length === 0 || totalCost === 0) {
    lots.forEach((l) => result.set(l.id, 0));
    return result;
  }

  const weightOf = (l: AllocLot): number => {
    switch (basis) {
      case "amount":
        return l.amount;
      case "weight":
        return l.weightG;
      case "qty":
        return l.qty;
      case "cbm":
      default:
        return l.cbm;
    }
  };

  const totalWeight = lots.reduce((s, l) => s + weightOf(l), 0);

  // 기준값이 전부 0이면 수량 균등 배분으로 폴백
  if (totalWeight <= 0) {
    const per = totalCost / lots.length;
    lots.forEach((l) => result.set(l.id, per));
    return roundToTotal(result, totalCost, lots);
  }

  for (const l of lots) {
    result.set(l.id, (totalCost * weightOf(l)) / totalWeight);
  }
  return roundToTotal(result, totalCost, lots);
}

/** 반올림 후 합계 오차를 마지막 로트에 흡수시켜 totalCost 보존 */
function roundToTotal(
  raw: Map<number, number>,
  totalCost: number,
  lots: AllocLot[]
): Map<number, number> {
  const out = new Map<number, number>();
  let acc = 0;
  lots.forEach((l, i) => {
    if (i === lots.length - 1) {
      out.set(l.id, Math.round((totalCost - acc) * 100) / 100);
    } else {
      const v = Math.round((raw.get(l.id) ?? 0) * 100) / 100;
      out.set(l.id, v);
      acc += v;
    }
  });
  return out;
}

/**
 * 배분기준 4종을 한번에 계산 — UI에서 "기준 바꾸면 결과가 어떻게 달라지나" 비교 표시용.
 */
export function compareAllocations(
  totalCost: number,
  lots: AllocLot[]
): Record<AllocationBasis, Map<number, number>> {
  return {
    cbm: allocateCommonCost(totalCost, lots, "cbm"),
    amount: allocateCommonCost(totalCost, lots, "amount"),
    weight: allocateCommonCost(totalCost, lots, "weight"),
    qty: allocateCommonCost(totalCost, lots, "qty"),
  };
}
