/**
 * 판매량 추정 — 리뷰 증가속도 기반 (유료툴 방식). 🔴 정직하게 신뢰도 배지 부여.
 *
 * 원리: 같은 상품을 시차 두고 2회+ 수집 → 리뷰 증가분 ÷ 리뷰작성률 = 판매량.
 * 쿠팡 리뷰작성률은 대략 1.5~3% → 월판매를 범위(밴드)로 추정.
 * 단일 수집이면 속도를 알 수 없어 추정 불가(누적 리뷰수만 참고).
 */

export type Confidence = "none" | "low" | "medium" | "high";

export interface Snap {
  reviewCount: number | null;
  collectedAt: string | Date;
}

export interface SalesEstimate {
  reviewCount: number; // 최신 누적 리뷰
  snapshots: number;
  daysSpan: number;
  reviewDelta: number;
  monthlyReviews: number;
  estMonthlyLow: number | null; // 리뷰율 3% 가정
  estMonthlyHigh: number | null; // 리뷰율 1.5% 가정
  confidence: Confidence;
  note: string;
}

const REVIEW_RATE_HIGH = 0.03; // 리뷰율 높게 → 판매량 낮게 (하한)
const REVIEW_RATE_LOW = 0.015; // 리뷰율 낮게 → 판매량 높게 (상한)
const DAY = 86_400_000;

export function estimateSales(snaps: Snap[]): SalesEstimate {
  const sorted = [...snaps]
    .map((s) => ({ rc: s.reviewCount ?? 0, t: new Date(s.collectedAt).getTime() }))
    .sort((a, b) => a.t - b.t);

  const latest = sorted[sorted.length - 1];
  const reviewCount = latest?.rc ?? 0;

  if (sorted.length < 2) {
    return {
      reviewCount,
      snapshots: sorted.length,
      daysSpan: 0,
      reviewDelta: 0,
      monthlyReviews: 0,
      estMonthlyLow: null,
      estMonthlyHigh: null,
      confidence: "none",
      note: "재수집 필요 — 3~7일 뒤 한 번 더 수집하면 판매량 추정 가능",
    };
  }

  const first = sorted[0];
  const daysSpan = Math.max(0, (latest.t - first.t) / DAY);
  const reviewDelta = Math.max(0, latest.rc - first.rc);
  const perDay = daysSpan > 0 ? reviewDelta / daysSpan : 0;
  const monthlyReviews = perDay * 30;

  const estMonthlyHigh = Math.round(monthlyReviews / REVIEW_RATE_LOW);
  const estMonthlyLow = Math.round(monthlyReviews / REVIEW_RATE_HIGH);

  let confidence: Confidence = "low";
  if (daysSpan >= 5 && reviewDelta >= 10) confidence = "high";
  else if (daysSpan >= 3 && reviewDelta >= 3) confidence = "medium";

  const note =
    confidence === "high"
      ? "리뷰 증가 뚜렷 — 추정 신뢰도 높음"
      : confidence === "medium"
        ? "리뷰 증가 확인 — 참고 가능"
        : "표본 부족 — 기간을 더 두고 재수집하면 정확해짐";

  return {
    reviewCount,
    snapshots: sorted.length,
    daysSpan: Math.round(daysSpan * 10) / 10,
    reviewDelta,
    monthlyReviews: Math.round(monthlyReviews),
    estMonthlyLow,
    estMonthlyHigh,
    confidence,
    note,
  };
}
