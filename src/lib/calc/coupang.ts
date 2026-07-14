import type { CoupangTables, PromoContext, SizeType } from "./types";
import { VAT_RATE, roundWon } from "./types";

export interface CoupangFeeInput {
  finalPrice: number; // 쿠폰 적용 후 최종 소비자 결제가
  sizeType: SizeType | null;
  asOfDate: string;
  storageDays: number; // 예상 보관일수
  monthlySalesQty: number; // 월 판매수량 (서비스료 배분/기준용)
}

export interface CoupangFeeResult {
  commission: number;
  inbound: number;
  shipping: number;
  storage: number;
  returnPickup: number;
  returnRestock: number;
  removal: number;
  serviceFeeAllocated: number; // 55,000 ÷ 월판매수량 (기준 초과시)
  vatOnFees: number; // 🔴 쿠팡 수수료·물류비는 VAT 별도 (공제대상)
  total: number; // 본체 + VAT
  totalExVat: number; // 본체만 (마진계산은 이 값 사용, VAT는 공제)
  appliedPromos: string[]; // 어떤 프로모션이 뭘 면제했는지
  warnings: string[];
}

/** 프로모션이 asOfDate 기준 유효한지 (D-day + 누적매출 캡) */
export function isPromoActive(ctx: PromoContext): {
  active: boolean;
  daysRemaining: number | null;
  reason: string;
} {
  const p = ctx.promo;
  if (!p || !p.myStartDate) return { active: false, daysRemaining: null, reason: "미시작" };
  const start = Date.parse(p.myStartDate + "T00:00:00Z");
  const now = Date.parse(ctx.asOfDate + "T00:00:00Z");
  const elapsedDays = Math.floor((now - start) / 86_400_000);
  const daysRemaining = p.capDays !== null ? p.capDays - elapsedDays : null;
  if (elapsedDays < 0) return { active: false, daysRemaining, reason: "시작 전" };
  if (p.capDays !== null && elapsedDays >= p.capDays)
    return { active: false, daysRemaining: 0, reason: "기간 종료(캡)" };
  if (p.capAmount !== null && (p.cumulativeRevenue ?? 0) >= p.capAmount)
    return { active: false, daysRemaining, reason: "누적매출 캡 도달" };
  return { active: true, daysRemaining, reason: "진행중" };
}

/** 특정 fee_key 가 프로모션/세이버로 면제되는지 */
function isWaived(feeKey: string, ctx: PromoContext, promoActive: boolean): string | null {
  if (promoActive && ctx.promo?.waives.includes(feeKey)) return ctx.promo.promoKey;
  // 세이버: 반품회수/재입고 무제한 무료 (반출비 제외), 보관 60일
  if (ctx.saverEnabled) {
    if (feeKey === "return_pickup" || feeKey === "return_restock") return "rg_saver";
  }
  return null;
}

/**
 * 쿠팡 로켓그로스 비용 (스펙 §2-2, §4 coupang.ts).
 * 🔴 요율/단가는 tables 로 주입 — 하드코딩 금지. 프로모션/세이버 면제 반영.
 */
export function calcCoupangFees(
  input: CoupangFeeInput,
  tables: CoupangTables,
  promoCtx: PromoContext
): CoupangFeeResult {
  const warnings: string[] = [];
  const appliedPromos = new Set<string>();
  const promoState = isPromoActive(promoCtx);

  const waive = (feeKey: string, amount: number): number => {
    const by = isWaived(feeKey, promoCtx, promoState.active);
    if (by) {
      appliedPromos.add(`${by}:${feeKey}`);
      return 0;
    }
    return amount;
  };

  // ① 판매수수료 — 쿠폰 적용 후 최종가 기준
  const commission = (input.finalPrice * tables.commissionRatePct) / 100;

  // ② 입출고비 + 배송비 (사이즈별)
  if (!tables.logistics) {
    warnings.push("사이즈 물류비 미설정 — 입출고비/배송비 0으로 계산됨(윙 확인 필요).");
  }
  const inbound = waive("inbound", tables.logistics?.inboundFee ?? 0);
  const shipping = waive("shipping", tables.logistics?.shippingFee ?? 0);

  // ④ 보관비 — 무료일수 초과분만 일할 부과
  const storageMisc = tables.misc["storage_fashion"] ?? tables.misc["storage"];
  let freeDays = storageMisc?.freeDays ?? 30;
  if (promoCtx.saverEnabled) freeDays = Math.max(freeDays, 60);
  if (promoState.active && promoCtx.promo?.waives.includes("storage")) {
    // 프로모션 보관 면제 (최대 capDays)
    freeDays = Math.max(freeDays, promoCtx.promo.capDays ?? freeDays);
    appliedPromos.add(`${promoCtx.promo.promoKey}:storage`);
  }
  const dailyStorage = storageMisc?.amount ?? 0;
  const billableStorageDays = Math.max(0, input.storageDays - freeDays);
  const storage = billableStorageDays * dailyStorage;
  if (billableStorageDays > 0 && dailyStorage === 0) {
    warnings.push("보관 일단가 미설정 — 보관비 0으로 계산됨.");
  }

  // ⑤ 반품 3종 (월 무료쿼터는 SKU 단위 계산 밖 → 여기선 단가만, 쿼터초과 가정)
  const returnPickup = waive("return_pickup", tables.misc["return_pickup"]?.amount ?? 0);
  const returnRestock = waive("return_restock", tables.misc["return_restock"]?.amount ?? 0);
  const removal = waive("removal", tables.misc["removal"]?.amount ?? 0);

  // ⑧ 월 서비스 이용료 배분 — 월매출이 기준 초과시 55,000 ÷ 월판매수량
  let serviceFeeAllocated = 0;
  const threshold = tables.serviceFeeThreshold;
  const monthlyRevenue = input.finalPrice * input.monthlySalesQty;
  if (threshold !== null && monthlyRevenue > threshold && input.monthlySalesQty > 0) {
    // 55,000 은 VAT 포함 → 본체는 /1.1
    serviceFeeAllocated = tables.serviceFeeAmount / 1.1 / input.monthlySalesQty;
  }

  // 본체 합 (VAT 제외)
  const bodyExVat =
    commission + inbound + shipping + storage + returnPickup + returnRestock + removal + serviceFeeAllocated;

  // ⑩ 쿠팡 수수료·물류비는 VAT 별도 (공제대상). 서비스료는 이미 VAT포함분을 제외했으므로 별도 VAT.
  const vatBase =
    commission + inbound + shipping + storage + returnPickup + returnRestock + removal + serviceFeeAllocated;
  const vatOnFees = vatBase * VAT_RATE;

  return {
    commission: roundWon(commission),
    inbound: roundWon(inbound),
    shipping: roundWon(shipping),
    storage: roundWon(storage),
    returnPickup: roundWon(returnPickup),
    returnRestock: roundWon(returnRestock),
    removal: roundWon(removal),
    serviceFeeAllocated: roundWon(serviceFeeAllocated),
    vatOnFees: roundWon(vatOnFees),
    total: roundWon(bodyExVat + vatOnFees),
    totalExVat: roundWon(bodyExVat),
    appliedPromos: [...appliedPromos],
    warnings,
  };
}
