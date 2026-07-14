import type { CostLine } from "./types";
import { VAT_RATE, roundWon } from "./types";

export interface LandedLotInput {
  orderQty: number;
  unitPriceCny: number;
  cnInlandCny: number; // 중국내 배송비 (CNY)
  agentFeeRate: number; // 0~0.05
  cardFeeRate: number; // 0 or 0.03
  fxRateAgent: number; // 결제 적용 환율 (KRW/CNY)
  fxRateCustoms: number; // 관세청 고시환율 (KRW/CNY)

  // 국제운송: lot_group 배분액 또는 직접입력 (KRW)
  allocatedShippingCost?: number;
  shippingCostDirect?: number;
  insuranceKrw?: number;

  tariffRate: number; // % (예: 13) — FTA 적용시 인하된 값 주입
  // 통관 부대비용 (KRW)
  customsFee?: number;
  blFee?: number;
  handlingFee?: number;
  domesticShipFee?: number;
  inspectionFee?: number;
  barcodeFee?: number; // per unit 부착비 (총액은 ×qty)
}

export interface LandedProductInput {
  certCostTotal?: number; // 인증비 일회성 총액
  certExpectedQty?: number; // 배분 예상 수량
}

export interface LandedResult {
  perUnit: number;
  totalForLot: number; // VAT 공제 반영 후 로트 총원가
  breakdown: CostLine[];
  vatCredit: number; // 이번 로트에서 공제 가능한 매입세액 합
}

/**
 * 착지원가 (스펙 §2-1, §4 landed.ts).
 * 🔴 함정: 수입부가세는 원가가 아님(일반과세자 공제). vatCreditEnabled(기본 ON)면 원가에서 제외.
 * 🔴 목록통관 $150 면세 로직 없음 — 사업자 정식통관은 금액 무관 과세.
 */
export function calcLandedCost(
  lot: LandedLotInput,
  product: LandedProductInput,
  opts: { vatCreditEnabled: boolean } = { vatCreditEnabled: true }
): LandedResult {
  const qty = Math.max(1, lot.orderQty);
  const lines: CostLine[] = [];

  // A. 사입 (제품구매비용) — (제품금액 + 중국내배송) × (1+대행) × (1+카드) × 환율
  const goodsCny = lot.unitPriceCny * qty + lot.cnInlandCny;
  const purchaseKrw =
    goodsCny * (1 + lot.agentFeeRate) * (1 + lot.cardFeeRate) * lot.fxRateAgent;
  lines.push(line("purchase", "사입(제품+중국내배송+대행+카드)", purchaseKrw, false));

  // B. 국제운송
  const intlShip = lot.allocatedShippingCost ?? lot.shippingCostDirect ?? 0;
  lines.push(line("intl_shipping", "국제운송", intlShip, false));

  // C. 통관 — 과세표준(CIF) = (상품가+중국내배송+국제운임+보험) × 고시환율
  const insurance = lot.insuranceKrw ?? 0;
  const cifKrw =
    (lot.unitPriceCny * qty + lot.cnInlandCny) * lot.fxRateCustoms + intlShip + insurance;
  const tariff = (cifKrw * lot.tariffRate) / 100;
  lines.push(line("tariff", `관세 (${lot.tariffRate}%)`, tariff, false));

  // 수입부가세 = (과세표준 + 관세) × 10% — 🔴 공제대상(원가 아님)
  const importVat = (cifKrw + tariff) * VAT_RATE;
  lines.push({
    key: "import_vat",
    label: "수입부가세 (매입세액)",
    amount: importVat,
    vat: 0,
    vatDeductible: true,
  });

  // 통관 부대비용
  pushIf(lines, "customs_fee", "통관수수료", lot.customsFee);
  pushIf(lines, "bl_fee", "B/L", lot.blFee);
  pushIf(lines, "handling_fee", "핸들링", lot.handlingFee);
  pushIf(lines, "domestic_ship", "국내배송비", lot.domesticShipFee);
  pushIf(lines, "inspection", "검수/포장", lot.inspectionFee);
  if (lot.barcodeFee) pushIf(lines, "barcode", "바코드부착", lot.barcodeFee * qty);

  // 인증비 배분 (일회성 ÷ 예상수량 × 이 로트 수량)
  if (product.certCostTotal && product.certExpectedQty && product.certExpectedQty > 0) {
    const certForLot = (product.certCostTotal / product.certExpectedQty) * qty;
    lines.push(line("cert", "인증비 배분", certForLot, false));
  }

  // 합계
  const grossTotal = lines.reduce((s, l) => s + l.amount, 0);
  const vatCredit = opts.vatCreditEnabled
    ? lines.filter((l) => l.vatDeductible).reduce((s, l) => s + l.amount, 0)
    : 0;

  // 🔴 수입부가세는 공제되므로 원가에서 제외
  const totalForLot = grossTotal - vatCredit;
  const perUnit = totalForLot / qty;

  return {
    perUnit: Math.round(perUnit * 100) / 100,
    totalForLot: roundWon(totalForLot),
    breakdown: lines.map((l) => ({ ...l, amount: roundWon(l.amount) })),
    vatCredit: roundWon(vatCredit),
  };
}

function line(key: string, label: string, amount: number, vatDeductible: boolean): CostLine {
  return { key, label, amount, vat: 0, vatDeductible };
}
function pushIf(lines: CostLine[], key: string, label: string, amount?: number) {
  if (amount && amount > 0) lines.push(line(key, label, amount, false));
}
