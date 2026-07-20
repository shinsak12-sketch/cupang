import { VAT_RATE, roundWon } from "./types";

/**
 * 직관형 마진 계산 (사용자 엑셀 "소싱리스트" 로직 그대로).
 *
 * 입력 순서(사용자 관점): 원가 → 사입비(대행/배송) → 기타비용 = 착지원가,
 *   그다음 판매가 · 판매수수료 · 입출고비 · 광고비.
 *
 * 엑셀 컬럼 매핑:
 *   G 입출고VAT = 입출고비 × 10%
 *   H 판매수수료 = 판매가 × 요율
 *   I 수수료VAT = 판매수수료 × 10%
 *   J 납부부가세 = (판매가−판매가/1.1) − (원가−원가/1.1) − G − I
 *   K 마진 = 판매가 − 원가 − 입출고비 − G − H − I − J
 *          = 판매가/1.1 − 착지원가/1.1 − 입출고비 − 판매수수료   (VAT 자동 상쇄)
 *   L 마진율 = K / 판매가
 *   M 최소광고수익률(ROAS) = 1.1 / 마진율
 */
export interface SimpleMarginInput {
  salePrice: number; // 판매가 (VAT 포함 결제가)
  landedCost: number; // 착지원가 = 원가 + 사입비 + 기타비용
  inboundShipFee: number; // 입출고비(+배송비)
  commissionPct: number; // 판매수수료율 % (예: 10.8)
  adCost?: number; // 광고비 (개당, 원)
}

export interface SimpleMarginResult {
  landedCost: number;
  commission: number; // H
  inboundShipFee: number;
  vatPayable: number; // J (납부부가세)
  margin: number; // K (광고 제외)
  marginRate: number; // %
  marginAfterAd: number; // 광고 반영
  marginRateAfterAd: number; // %
  breakevenRoas: number; // 광고 손익분기 ROAS (배수)
  verdict: "양호" | "주의" | "위험";
}

export function calcSimpleMargin(input: SimpleMarginInput): SimpleMarginResult {
  const B = input.salePrice;
  const D = input.landedCost;
  const E = input.inboundShipFee;
  const F = input.commissionPct / 100;
  const ad = input.adCost ?? 0;

  const G = E * VAT_RATE; // 입출고 VAT
  const H = B * F; // 판매수수료
  const I = H * VAT_RATE; // 수수료 VAT
  const J = B - B / (1 + VAT_RATE) - (D - D / (1 + VAT_RATE)) - G - I; // 납부부가세
  const K = B - D - E - G - H - I - J; // 마진

  const marginRate = B > 0 ? (K / B) * 100 : 0;
  const marginAfterAd = K - ad;
  const marginRateAfterAd = B > 0 ? (marginAfterAd / B) * 100 : 0;
  const breakevenRoas = marginRate > 0 ? (1 + VAT_RATE) / (marginRate / 100) : 0;

  const rate = marginRateAfterAd;
  const verdict = rate <= 0 ? "위험" : rate < 15 ? "주의" : "양호";

  return {
    landedCost: roundWon(D),
    commission: roundWon(H),
    inboundShipFee: roundWon(E),
    vatPayable: roundWon(J),
    margin: roundWon(K),
    marginRate: Math.round(marginRate * 10) / 10,
    marginAfterAd: roundWon(marginAfterAd),
    marginRateAfterAd: Math.round(marginRateAfterAd * 10) / 10,
    breakevenRoas: Math.round(breakevenRoas * 100) / 100,
    verdict,
  };
}
