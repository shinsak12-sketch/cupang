import type { Dimensions, SizeRule, SizeType } from "./types";

export interface SizeResult {
  sizeType: SizeType | null; // null = 규칙 미설정
  rulesConfigured: boolean;
  billableWeightG: number; // max(실중량, 부피무게)
  volumetricWeightG: number;
  dimSumMm: number;
  isRgEligible: boolean; // 3변합 250cm / 30kg 체크
  boundaryWarnings: string[]; // 🔴 "3변합 40mm 줄이면 S→XS"
}

// 로켓그로스 등록 한계 (스펙 §2-2 ③)
const RG_MAX_DIM_SUM_MM = 2500; // 250cm
const RG_MAX_WEIGHT_G = 30000; // 30kg

/**
 * 부피무게(g) = (W×D×H mm) / divisor.
 * (표준 항공 부피무게: cm³/6000 = kg → g 로 환산하면 mm 곱÷divisor 와 동일)
 */
export function volumetricWeightG(dims: Dimensions, divisor = 6000): number {
  return (dims.wMm * dims.dMm * dims.hMm) / divisor;
}

/**
 * 사이즈 판정. 규칙은 DB(fee_size_rule)에서 읽어와 주입 — 🔴 하드코딩 금지.
 * 규칙 미설정시 에러가 아니라 rulesConfigured=false 상태 반환 (스펙 §7).
 *
 * 판정 원리(스펙 §2-2 ③): 3변합 기준 사이즈와 중량 기준 사이즈 중 "더 높은(큰) 등급" 적용.
 * 중량은 실중량과 부피무게 중 큰 값(billableWeight)을 사용.
 */
export function resolveSize(
  dims: Dimensions,
  weightG: number,
  rules: SizeRule[]
): SizeResult {
  const dimSumMm = dims.wMm + dims.dMm + dims.hMm;
  const divisor = rules[0]?.volumetricDivisor ?? 6000;
  const volG = volumetricWeightG(dims, divisor);
  const billableWeightG = Math.max(weightG, volG);
  const isRgEligible = dimSumMm <= RG_MAX_DIM_SUM_MM && weightG <= RG_MAX_WEIGHT_G;

  if (rules.length === 0) {
    return {
      sizeType: null,
      rulesConfigured: false,
      billableWeightG,
      volumetricWeightG: volG,
      dimSumMm,
      isRgEligible,
      boundaryWarnings: ["사이즈 판정 규칙(fee_size_rule) 미설정 — 윙에서 확인 후 입력하세요."],
    };
  }

  const sorted = [...rules].sort((a, b) => a.sortOrder - b.sortOrder);

  const sizeByDim = smallestFit(sorted, (r) => r.maxDimensionSumMm, dimSumMm);
  const sizeByWeight = smallestFit(sorted, (r) => r.maxWeightG, billableWeightG);

  // 더 높은 등급 채택
  const chosen = higher(sorted, sizeByDim, sizeByWeight);
  const sizeType = chosen?.sizeType ?? null;

  const boundaryWarnings = chosen
    ? buildBoundaryWarnings(sorted, chosen, dimSumMm, billableWeightG)
    : [`${dimSumMm}mm / ${Math.round(billableWeightG)}g 는 최대 규칙을 초과 — 등록 불가 가능성.`];

  return {
    sizeType,
    rulesConfigured: true,
    billableWeightG,
    volumetricWeightG: volG,
    dimSumMm,
    isRgEligible,
    boundaryWarnings,
  };
}

function smallestFit(
  sorted: SizeRule[],
  bound: (r: SizeRule) => number | null,
  value: number
): SizeRule | null {
  for (const r of sorted) {
    const max = bound(r);
    if (max === null || value <= max) return r;
  }
  return null;
}

function higher(sorted: SizeRule[], a: SizeRule | null, b: SizeRule | null): SizeRule | null {
  if (!a) return b;
  if (!b) return a;
  return a.sortOrder >= b.sortOrder ? a : b;
}

/**
 * 🔴 경계 경고: 현재 등급에서 한 단계 아래로 내려가려면 얼마 줄여야 하는지.
 * 초보는 이 경계를 모르는데 실제로 마진을 바꿈.
 */
function buildBoundaryWarnings(
  sorted: SizeRule[],
  current: SizeRule,
  dimSumMm: number,
  billableWeightG: number
): string[] {
  const idx = sorted.findIndex((r) => r.sizeType === current.sizeType);
  const lower = sorted[idx - 1];
  const warnings: string[] = [];
  if (!lower) {
    warnings.push(`이미 최소 등급(${current.sizeType})입니다.`);
    return warnings;
  }
  const needDim = lower.maxDimensionSumMm !== null ? dimSumMm - lower.maxDimensionSumMm : 0;
  const needWeight = lower.maxWeightG !== null ? billableWeightG - lower.maxWeightG : 0;
  const parts: string[] = [];
  if (needDim > 0) parts.push(`3변합 -${Math.ceil(needDim)}mm`);
  if (needWeight > 0) parts.push(`과금중량 -${Math.ceil(needWeight)}g`);
  if (parts.length === 0) {
    warnings.push(`경계에 근접 — 소폭만 늘어도 ${current.sizeType} 유지.`);
  } else {
    warnings.push(`${parts.join(", ")} 줄이면 ${current.sizeType}→${lower.sizeType} 등급 하락 가능.`);
  }
  return warnings;
}
