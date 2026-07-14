import type { CoupangTables, Dimensions, PromoContext, SizeRule, SizeType } from "./types";
import { resolveSize } from "./size";
import { calcCoupangFees } from "./coupang";
import { calcMargin } from "./margin";
import { reversePrice } from "./reverse";
import type { ScenarioAssumption } from "./scenario";

export interface SetOptParams {
  unitDims: Dimensions; // 낱개 포장 치수
  unitWeightG: number;
  landedCostPerUnit: number; // 낱개 착지원가
  candidateQtys: number[]; // 예: [1,3,5,10]
  targetMarginRate: number; // 목표 마진 % (역산 기준)
  asOfDate: string;
  sizeRules: SizeRule[];
  logisticsBySize: Partial<Record<SizeType, { inboundFee: number; shippingFee: number }>>;
  tablesBase: Omit<CoupangTables, "logistics">;
  promoCtx: PromoContext;
  assumption: ScenarioAssumption;
  returnResalable: boolean;
  disposalCost: number;
  measuredDims?: Record<number, Dimensions>; // 실측 세트 치수 (있으면 우선)
  packingFactor?: number; // 부피 여유 (기본 1.15)
  freeShippingThreshold?: number; // 기본 19,800
}

export interface SetOptRow {
  setQty: number;
  pkgDims: Dimensions;
  pkgWeightG: number;
  sizeType: SizeType | null;
  suggestedPrice: number;
  freeShippingOk: boolean; // 🔴 19,800원 경계 통과
  feasible: boolean; // 목표 마진 도달 가능?
  inbound: number;
  shipping: number;
  logisticsCostPerUnit: number;
  marginRate: number;
  netProfitPerSet: number;
  netProfitPerUnit: number;
}

export interface SetOptResult {
  results: SetOptRow[];
  recommended: number | null;
  tradeoffNote: string;
}

/** 낱개 치수 → N개 세트 치수 추정 (등방 스케일 s=∛(N×여유)). 실측 있으면 그걸 사용. */
function estimateDims(unit: Dimensions, n: number, packing: number): Dimensions {
  const s = Math.cbrt(n * packing);
  return {
    wMm: Math.round(unit.wMm * s),
    dMm: Math.round(unit.dMm * s),
    hMm: Math.round(unit.hMm * s),
  };
}

/**
 * 세트 최적화 (스펙 §4 setopt.ts) — 🔴 양말 때문에 추가된 핵심 기능.
 * 족수↑ → 객단가↑·개당물류비↓ 이지만 사이즈 등급↑. 트레이드오프 최적점 탐색.
 */
export function optimizeSetSize(p: SetOptParams): SetOptResult {
  const threshold = p.freeShippingThreshold ?? 19800;
  const packing = p.packingFactor ?? 1.15;

  const results: SetOptRow[] = p.candidateQtys.map((qty) => {
    const pkgDims = p.measuredDims?.[qty] ?? estimateDims(p.unitDims, qty, packing);
    const pkgWeightG = qty * p.unitWeightG;
    const size = resolveSize(pkgDims, pkgWeightG, p.sizeRules);
    const logistics = size.sizeType ? p.logisticsBySize[size.sizeType] ?? null : null;
    const tables: CoupangTables = { ...p.tablesBase, logistics };
    const landedSet = p.landedCostPerUnit * qty;

    const rev = reversePrice({
      targetMarginRate: p.targetMarginRate,
      landedCostPerUnit: landedSet,
      sizeType: size.sizeType,
      asOfDate: p.asOfDate,
      returnResalable: p.returnResalable,
      disposalCost: p.disposalCost,
      assumption: p.assumption,
      tables,
      promoCtx: p.promoCtx,
    });
    const price = rev.requiredPrice;

    const fees = calcCoupangFees(
      {
        finalPrice: price,
        sizeType: size.sizeType,
        asOfDate: p.asOfDate,
        storageDays: p.assumption.avgStorageDays,
        monthlySalesQty: p.assumption.monthlySalesQty,
      },
      tables,
      p.promoCtx
    );
    const adCost =
      p.assumption.adCostRatio !== null
        ? (price * p.assumption.adCostRatio) / 100
        : p.assumption.targetRoas
          ? price / (p.assumption.targetRoas / 100)
          : 0;
    const margin = calcMargin({
      finalPrice: price,
      landedCostPerUnit: landedSet,
      coupangFeesExVat: fees.totalExVat,
      adCostInclVat: adCost,
      returnRate: p.assumption.returnRate,
      returnResalable: p.returnResalable,
      returnPickupCost: fees.returnPickup,
      returnRestockCost: fees.returnRestock,
      disposalCost: p.disposalCost,
    });

    return {
      setQty: qty,
      pkgDims,
      pkgWeightG,
      sizeType: size.sizeType,
      suggestedPrice: price,
      freeShippingOk: price >= threshold,
      feasible: rev.feasible,
      inbound: fees.inbound,
      shipping: fees.shipping,
      logisticsCostPerUnit: Math.round((fees.inbound + fees.shipping) / qty),
      marginRate: margin.marginRate,
      netProfitPerSet: margin.netProfit,
      netProfitPerUnit: Math.round(margin.netProfit / qty),
    };
  });

  // 추천: 무료배송 통과 && 실현가능 중 개당 순이익 최대. 없으면 전체 중 개당 순이익 최대.
  const eligible = results.filter((r) => r.freeShippingOk && r.feasible);
  const pool = eligible.length > 0 ? eligible : results;
  const best = pool.reduce(
    (a, b) => (b.netProfitPerUnit > a.netProfitPerUnit ? b : a),
    pool[0]
  );

  const tradeoffNote = buildTradeoff(results, best);
  return { results, recommended: best?.setQty ?? null, tradeoffNote };
}

function buildTradeoff(rows: SetOptRow[], best?: SetOptRow): string {
  if (!best) return "후보 없음.";
  const idx = rows.findIndex((r) => r.setQty === best.setQty);
  const nbr = rows[idx + 1] ?? rows[idx - 1];
  if (!nbr) return `${best.setQty}족 추천 (개당 순이익 ${best.netProfitPerUnit.toLocaleString("ko-KR")}원).`;
  const sizeMove =
    best.sizeType !== nbr.sizeType ? ` ${best.sizeType}→${nbr.sizeType} 등급 변동,` : "";
  const shipDelta = nbr.shipping - best.shipping;
  return (
    `${best.setQty}족 추천. ${best.setQty}→${nbr.setQty}족 비교:${sizeMove} ` +
    `객단가 ${best.suggestedPrice.toLocaleString("ko-KR")}→${nbr.suggestedPrice.toLocaleString("ko-KR")}원, ` +
    `배송비 ${shipDelta >= 0 ? "+" : ""}${shipDelta.toLocaleString("ko-KR")}원, ` +
    `개당물류비 ${best.logisticsCostPerUnit.toLocaleString("ko-KR")}→${nbr.logisticsCostPerUnit.toLocaleString("ko-KR")}원.`
  );
}
