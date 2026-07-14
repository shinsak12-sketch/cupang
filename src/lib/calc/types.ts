/**
 * 계산 엔진 공용 타입 (CLAUDE_CODE_PROMPT §4).
 * 🔴 순수 함수 전용 — UI/DB 의존 0. 모든 수치는 number (DB numeric→number 변환은 호출측 책임).
 * 🔴 모든 계산 함수는 asOfDate 를 받아 해당 시점 유효 요율로 계산.
 */

export type SizeType = "XS" | "S" | "M" | "L1" | "L2" | "XL";
export type Scenario = "optimistic" | "base" | "pessimistic";
export type Verdict = "GO" | "CAUTION" | "NO-GO";
export type AllocationBasis = "amount" | "cbm" | "weight" | "qty";

export interface Dimensions {
  wMm: number;
  dMm: number;
  hMm: number;
}

export interface SizeRule {
  sizeType: SizeType;
  maxDimensionSumMm: number | null;
  maxWeightG: number | null;
  volumetricDivisor: number; // default 6000
  sortOrder: number; // XS=0 ... XL=5 (작을수록 소형)
}

/** 원가 명세 1줄 — VAT 공제여부 포함 */
export interface CostLine {
  key: string;
  label: string;
  amount: number; // KRW (VAT 제외 본체 금액)
  vat: number; // 이 라인에 붙는 VAT
  vatDeductible: boolean; // 매입세액 공제 대상인가
}

/** RG 프로모션/세이버 컨텍스트 */
export interface PromoContext {
  asOfDate: string; // YYYY-MM-DD
  saverEnabled: boolean;
  /** 신규 90일 프로모션 */
  promo?: {
    promoKey: string;
    waives: string[]; // 면제되는 fee_key
    capDays: number | null;
    capAmount: number | null;
    myStartDate: string | null; // D-day 기준
    cumulativeRevenue?: number; // 누적매출 (캡 판정)
  } | null;
}

export interface CoupangTables {
  commissionRatePct: number; // 카테고리 판매수수료 %
  serviceFeeThreshold: number | null; // 월매출 기준
  logistics: { inboundFee: number; shippingFee: number } | null; // 사이즈별 (없으면 미설정)
  misc: Record<
    string,
    { amount: number | null; freeQuota: number | null; freeDays: number | null }
  >;
  serviceFeeAmount: number; // 55,000 (VAT 포함)
}

export const VAT_RATE = 0.1;

/** KRW 반올림 (원 단위) */
export function roundWon(n: number): number {
  return Math.round(n);
}
