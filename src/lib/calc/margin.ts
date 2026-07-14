import { VAT_RATE, roundWon } from "./types";

export interface MarginInput {
  finalPrice: number; // 소비자 결제가 (VAT 포함)
  landedCostPerUnit: number; // 착지원가 (수입VAT 공제 반영)
  coupangFeesExVat: number; // 쿠팡 수수료 본체 (VAT는 공제되므로 제외)
  adCostInclVat: number; // 광고비 (VAT 포함 지출)
  returnRate: number; // %
  returnResalable: boolean; // 🔴 false면 반품=원가 전손
  returnPickupCost: number; // 반품 1건 회수비
  returnRestockCost: number; // 반품 1건 재입고비
  disposalCost: number; // 폐기비 (비재판매시)
  fixedCost?: number; // 일회성 고정비 (BEP용) — 인증 초기비 등
}

export interface MarginResult {
  revenueExVat: number;
  netProfit: number; // 세전 순이익 (개당)
  marginRate: number; // % (순이익 / VAT제외매출)
  roi: number; // % (순이익 / 착지원가)
  returnLoss: number; // 개당 기대 반품손실
  breakevenQty: number; // 고정비 회수 수량 (없으면 0)
}

/**
 * 마진 계산 (스펙 §4 margin.ts). 매출은 VAT 제외 기준, 쿠팡수수료 VAT는 공제되므로 원가에서 제외.
 * 🔴 return_resalable=false 면 반품시 원가 전손(+회수+폐기) — 위생용품(양말) 필수.
 */
export function calcMargin(input: MarginInput): MarginResult {
  const revenueExVat = input.finalPrice / (1 + VAT_RATE);
  const adCostExVat = input.adCostInclVat / (1 + VAT_RATE);

  const r = input.returnRate / 100;
  const lossOnReturn = input.returnResalable
    ? input.returnPickupCost + input.returnRestockCost
    : input.landedCostPerUnit + input.returnPickupCost + input.disposalCost;
  const returnLoss = r * lossOnReturn;

  const netProfit =
    revenueExVat -
    input.landedCostPerUnit -
    input.coupangFeesExVat -
    adCostExVat -
    returnLoss;

  const marginRate = revenueExVat > 0 ? (netProfit / revenueExVat) * 100 : 0;
  const roi = input.landedCostPerUnit > 0 ? (netProfit / input.landedCostPerUnit) * 100 : 0;
  const breakevenQty =
    input.fixedCost && input.fixedCost > 0 && netProfit > 0
      ? Math.ceil(input.fixedCost / netProfit)
      : 0;

  return {
    revenueExVat: roundWon(revenueExVat),
    netProfit: roundWon(netProfit),
    marginRate: Math.round(marginRate * 10) / 10,
    roi: Math.round(roi * 10) / 10,
    returnLoss: roundWon(returnLoss),
    breakevenQty,
  };
}
