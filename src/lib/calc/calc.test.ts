import { describe, it, expect } from "vitest";
import {
  resolveSize,
  allocateCommonCost,
  calcLandedCost,
  calcCoupangFees,
  calcMargin,
  calcScenarios,
  reversePrice,
  comparePromoVsPost,
  calcCashflow,
  optimizeSetSize,
  type SizeRule,
  type CoupangTables,
  type PromoContext,
} from "./index";
import type { ScenarioAssumption } from "./scenario";

/**
 * 🔴 사이즈 임계값은 공식 확인 불가 → 아래는 양말 테스트케이스(socks_profile.ts)의
 *    기대 등급(XS,XS,S,S,M)을 만족하도록 구성한 "테스트 픽스처". DB fee_size_rule 에는
 *    윙에서 확인한 실제값을 넣어야 하며, 여기선 resolveSize 로직만 검증한다.
 */
const SIZE_RULES: SizeRule[] = [
  { sizeType: "XS", maxDimensionSumMm: 450, maxWeightG: 500, volumetricDivisor: 6000, sortOrder: 0 },
  { sizeType: "S", maxDimensionSumMm: 700, maxWeightG: 2000, volumetricDivisor: 6000, sortOrder: 1 },
  { sizeType: "M", maxDimensionSumMm: 1000, maxWeightG: 5000, volumetricDivisor: 6000, sortOrder: 2 },
  { sizeType: "L1", maxDimensionSumMm: 1500, maxWeightG: 10000, volumetricDivisor: 6000, sortOrder: 3 },
  { sizeType: "L2", maxDimensionSumMm: 2000, maxWeightG: 20000, volumetricDivisor: 6000, sortOrder: 4 },
  { sizeType: "XL", maxDimensionSumMm: 2500, maxWeightG: 30000, volumetricDivisor: 6000, sortOrder: 5 },
];

describe("resolveSize — 양말 테스트케이스", () => {
  const cases = [
    { name: "양말 1족 폴리백", w: 120, d: 30, h: 180, g: 60, expect: "XS" },
    { name: "양말 3족 세트", w: 150, d: 60, h: 200, g: 180, expect: "XS" },
    { name: "양말 5족 세트", w: 180, d: 90, h: 220, g: 300, expect: "S" },
    { name: "양말 10족 박스", w: 250, d: 150, h: 280, g: 600, expect: "S" },
    { name: "경계 테스트", w: 300, d: 200, h: 300, g: 1000, expect: "M" },
  ] as const;

  for (const c of cases) {
    it(`${c.name} → ${c.expect}`, () => {
      const r = resolveSize({ wMm: c.w, dMm: c.d, hMm: c.h }, c.g, SIZE_RULES);
      expect(r.sizeType).toBe(c.expect);
      expect(r.rulesConfigured).toBe(true);
      expect(r.isRgEligible).toBe(true);
    });
  }

  it("부피무게가 실중량보다 크면 부피무게로 과금", () => {
    const r = resolveSize({ wMm: 120, dMm: 30, hMm: 180 }, 60, SIZE_RULES);
    // 120*30*180/6000 = 108g > 60g
    expect(r.volumetricWeightG).toBeCloseTo(108, 0);
    expect(r.billableWeightG).toBeCloseTo(108, 0);
  });

  it("규칙 미설정시 에러 대신 rulesConfigured=false 반환", () => {
    const r = resolveSize({ wMm: 120, dMm: 30, hMm: 180 }, 60, []);
    expect(r.rulesConfigured).toBe(false);
    expect(r.sizeType).toBeNull();
    expect(r.boundaryWarnings[0]).toContain("미설정");
  });

  it("경계 경고: 등급 하락에 필요한 감축량 안내", () => {
    // 5족(S) → XS 로 내리려면 감축 필요
    const r = resolveSize({ wMm: 180, dMm: 90, hMm: 220 }, 300, SIZE_RULES);
    expect(r.sizeType).toBe("S");
    expect(r.boundaryWarnings.join()).toMatch(/XS/);
  });

  it("RG 등록 한계 초과(3변합>250cm)면 부적격", () => {
    const r = resolveSize({ wMm: 1000, dMm: 1000, hMm: 700 }, 1000, SIZE_RULES);
    expect(r.isRgEligible).toBe(false);
  });
});

describe("allocateCommonCost — 공통비 배분", () => {
  const lots = [
    { id: 1, amount: 100, cbm: 1, weightG: 1000, qty: 10 },
    { id: 2, amount: 300, cbm: 3, weightG: 1000, qty: 10 },
  ];
  it("기본 cbm 기준: 1:3 배분", () => {
    const m = allocateCommonCost(100000, lots, "cbm");
    expect(m.get(1)).toBe(25000);
    expect(m.get(2)).toBe(75000);
  });
  it("amount 기준은 cbm 과 다르게 배분(부피 큰 저가품 착각 방지)", () => {
    const m = allocateCommonCost(100000, lots, "amount");
    expect(m.get(1)).toBe(25000); // 100/400
    expect(m.get(2)).toBe(75000);
  });
  it("qty 균등 기준", () => {
    const m = allocateCommonCost(100000, lots, "qty");
    expect(m.get(1)).toBe(50000);
    expect(m.get(2)).toBe(50000);
  });
  it("합계는 totalCost 보존", () => {
    const m = allocateCommonCost(99999, lots, "weight");
    expect((m.get(1) ?? 0) + (m.get(2) ?? 0)).toBeCloseTo(99999, 2);
  });
});

describe("calcLandedCost — 착지원가 & 수입VAT 공제", () => {
  const lot = {
    orderQty: 100,
    unitPriceCny: 10,
    cnInlandCny: 50,
    agentFeeRate: 0.03,
    cardFeeRate: 0,
    fxRateAgent: 190,
    fxRateCustoms: 185,
    shippingCostDirect: 200000,
    tariffRate: 13,
    customsFee: 16500,
    handlingFee: 33000,
  };
  it("수입부가세는 공제되어 원가에서 제외(기본 ON)", () => {
    const on = calcLandedCost(lot, {}, { vatCreditEnabled: true });
    const off = calcLandedCost(lot, {}, { vatCreditEnabled: false });
    expect(on.vatCredit).toBeGreaterThan(0);
    expect(on.perUnit).toBeLessThan(off.perUnit); // 공제하면 원가↓
    const importVatLine = on.breakdown.find((l) => l.key === "import_vat");
    expect(importVatLine?.vatDeductible).toBe(true);
    expect(on.vatCredit).toBe(importVatLine?.amount);
  });
  it("perUnit > 0, breakdown 에 관세/사입 포함", () => {
    const r = calcLandedCost(lot, {});
    expect(r.perUnit).toBeGreaterThan(0);
    expect(r.breakdown.map((l) => l.key)).toEqual(
      expect.arrayContaining(["purchase", "tariff", "import_vat"])
    );
  });
});

const MISC = {
  storage: { amount: 0, freeQuota: null, freeDays: 30 },
  storage_fashion: { amount: 0, freeQuota: null, freeDays: 45 },
  return_pickup: { amount: 3000, freeQuota: 20, freeDays: null },
  return_restock: { amount: 1000, freeQuota: 20, freeDays: null },
  removal: { amount: 300, freeQuota: 20, freeDays: null },
};
const TABLES: CoupangTables = {
  commissionRatePct: 10.5,
  serviceFeeThreshold: 1_000_000,
  logistics: { inboundFee: 600, shippingFee: 1350 },
  misc: MISC,
  serviceFeeAmount: 55000,
};
const NO_PROMO: PromoContext = { asOfDate: "2026-07-14", saverEnabled: false, promo: null };
const ACTIVE_PROMO: PromoContext = {
  asOfDate: "2026-07-14",
  saverEnabled: false,
  promo: {
    promoKey: "rg_zerocost_new",
    waives: ["inbound", "shipping", "storage", "return_pickup", "return_restock", "removal"],
    capDays: 90,
    capAmount: 200_000_000,
    myStartDate: "2026-07-01",
    cumulativeRevenue: 0,
  },
};

describe("calcCoupangFees — 프로모션 면제", () => {
  it("판매수수료 = 최종가 × 요율", () => {
    const r = calcCoupangFees(
      { finalPrice: 10000, sizeType: "XS", asOfDate: "2026-07-14", storageDays: 20, monthlySalesQty: 100 },
      TABLES,
      NO_PROMO
    );
    expect(r.commission).toBe(1050);
    expect(r.inbound).toBe(600);
    expect(r.shipping).toBe(1350);
  });
  it("신규 90일 프로모션 활성시 입출고비·배송비 0", () => {
    const r = calcCoupangFees(
      { finalPrice: 10000, sizeType: "XS", asOfDate: "2026-07-14", storageDays: 20, monthlySalesQty: 100 },
      TABLES,
      ACTIVE_PROMO
    );
    expect(r.inbound).toBe(0);
    expect(r.shipping).toBe(0);
    expect(r.appliedPromos).toEqual(expect.arrayContaining(["rg_zerocost_new:inbound"]));
  });
  it("쿠팡 수수료는 VAT 별도", () => {
    const r = calcCoupangFees(
      { finalPrice: 10000, sizeType: "XS", asOfDate: "2026-07-14", storageDays: 20, monthlySalesQty: 100 },
      TABLES,
      NO_PROMO
    );
    expect(r.vatOnFees).toBeCloseTo(r.totalExVat * 0.1, 0);
  });
});

describe("calcMargin — 반품 원가 전손", () => {
  const base = {
    finalPrice: 10000,
    landedCostPerUnit: 3000,
    coupangFeesExVat: 3000,
    adCostInclVat: 1000,
    returnRate: 10,
    returnPickupCost: 3000,
    returnRestockCost: 1000,
    disposalCost: 500,
  };
  it("return_resalable=false 면 반품손실에 원가 전손 포함", () => {
    const resalable = calcMargin({ ...base, returnResalable: true });
    const totalLoss = calcMargin({ ...base, returnResalable: false });
    expect(totalLoss.returnLoss).toBeGreaterThan(resalable.returnLoss);
    // 비재판매 손실 = 10% × (3000 원가 + 3000 회수 + 500 폐기) = 650
    expect(totalLoss.returnLoss).toBe(650);
  });
  it("마진은 VAT 제외 매출 기준", () => {
    const m = calcMargin({ ...base, returnResalable: true });
    expect(m.revenueExVat).toBeCloseTo(10000 / 1.1, 0);
  });
});

const ASSUMPTIONS: Record<"optimistic" | "base" | "pessimistic", ScenarioAssumption> = {
  optimistic: { returnRate: 5, defectRate: 2, targetRoas: 400, adCostRatio: null, avgStorageDays: 25, monthlySalesQty: 100 },
  base: { returnRate: 8, defectRate: 3, targetRoas: 300, adCostRatio: null, avgStorageDays: 45, monthlySalesQty: 80 },
  pessimistic: { returnRate: 15, defectRate: 6, targetRoas: 150, adCostRatio: null, avgStorageDays: 75, monthlySalesQty: 50 },
};

describe("calcScenarios — GO/CAUTION/NO-GO 판정", () => {
  it("비관 순이익 음수면 NO-GO", () => {
    const r = calcScenarios({
      finalPrice: 10000,
      landedCostPerUnit: 4000,
      sizeType: "XS",
      asOfDate: "2026-07-14",
      returnResalable: false, // 양말: 반품 전손
      disposalCost: 500,
      tables: TABLES,
      promoCtx: NO_PROMO,
      assumptions: ASSUMPTIONS,
    });
    if (r.pessimistic.netProfit < 0) expect(r.verdict).toBe("NO-GO");
    expect(["GO", "CAUTION", "NO-GO"]).toContain(r.verdict);
  });
  it("프로모션 활성시 물류비 면제로 마진 개선", () => {
    const withPromo = calcScenarios({
      finalPrice: 12000,
      landedCostPerUnit: 3000,
      sizeType: "XS",
      asOfDate: "2026-07-14",
      returnResalable: true,
      disposalCost: 0,
      tables: TABLES,
      promoCtx: ACTIVE_PROMO,
      assumptions: ASSUMPTIONS,
    });
    const without = calcScenarios({
      finalPrice: 12000,
      landedCostPerUnit: 3000,
      sizeType: "XS",
      asOfDate: "2026-07-14",
      returnResalable: true,
      disposalCost: 0,
      tables: TABLES,
      promoCtx: NO_PROMO,
      assumptions: ASSUMPTIONS,
    });
    expect(withPromo.base.netProfit).toBeGreaterThan(without.base.netProfit);
  });
});

describe("comparePromoVsPost — 프로모션 절벽", () => {
  it("프로모션 중/후 마진 병렬 + cliff 양수", () => {
    const r = comparePromoVsPost({
      finalPrice: 10000,
      landedCostPerUnit: 3000,
      sizeType: "XS",
      asOfDate: "2026-07-14",
      returnResalable: true,
      disposalCost: 0,
      assumption: ASSUMPTIONS.base,
      tables: TABLES,
      promoCtx: ACTIVE_PROMO,
    });
    expect(r.duringPromo.netProfit).toBeGreaterThan(r.afterPromo.netProfit);
    expect(r.cliffAmount).toBeGreaterThan(0);
    expect(r.cliffMarginPoints).toBeGreaterThan(0);
    expect(r.revenueCapRemaining).toBe(200_000_000);
  });
});

describe("reversePrice — 목표 마진 역산", () => {
  it("역산 가격에서 목표 마진 근사 달성", () => {
    const r = reversePrice({
      targetMarginRate: 25,
      landedCostPerUnit: 3000,
      sizeType: "XS",
      asOfDate: "2026-07-14",
      returnResalable: true,
      disposalCost: 0,
      assumption: ASSUMPTIONS.base,
      tables: TABLES,
      promoCtx: NO_PROMO,
    });
    expect(r.feasible).toBe(true);
    expect(r.achievedMarginRate).toBeGreaterThanOrEqual(24.5);
  });
});

describe("calcCashflow — 현금순환", () => {
  it("maxCashLocked 와 회수일 계산", () => {
    const r = calcCashflow({
      investmentKrw: 300000,
      orderQty: 100,
      paidDate: "2026-07-01",
      inboundDate: "2026-08-01",
      monthlySalesQty: 50,
      settlementPerUnit: 7000,
      settlementLagDays: 15,
    });
    expect(r.maxCashLocked).toBe(300000); // 판매 전 최대 묶임
    expect(r.recoveryDays).toBeGreaterThan(0);
    expect(r.fullyRecovered).toBe(true);
    expect(r.timeline[0].amount).toBe(-300000);
  });
});

describe("optimizeSetSize — 세트 최적화", () => {
  it("후보별 결과와 추천 반환", () => {
    const r = optimizeSetSize({
      unitDims: { wMm: 120, dMm: 30, hMm: 180 },
      unitWeightG: 60,
      landedCostPerUnit: 1500,
      candidateQtys: [1, 3, 5, 10],
      targetMarginRate: 20,
      asOfDate: "2026-07-14",
      sizeRules: SIZE_RULES,
      logisticsBySize: {
        XS: { inboundFee: 600, shippingFee: 1350 },
        S: { inboundFee: 650, shippingFee: 1550 },
        M: { inboundFee: 1250, shippingFee: 2100 },
      },
      tablesBase: {
        commissionRatePct: 10.5,
        serviceFeeThreshold: 1_000_000,
        misc: MISC,
        serviceFeeAmount: 55000,
      },
      promoCtx: NO_PROMO,
      assumption: ASSUMPTIONS.base,
      returnResalable: false,
      disposalCost: 500,
    });
    expect(r.results).toHaveLength(4);
    expect(r.recommended).not.toBeNull();
    // 개당 물류비는 족수 늘수록 감소 경향
    const one = r.results.find((x) => x.setQty === 1)!;
    const ten = r.results.find((x) => x.setQty === 10)!;
    expect(ten.logisticsCostPerUnit).toBeLessThan(one.logisticsCostPerUnit);
    expect(r.tradeoffNote).toBeTruthy();
  });
});
