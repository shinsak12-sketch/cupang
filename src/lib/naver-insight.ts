/**
 * 네이버 쇼핑인사이트 — 분야(카테고리)별 클릭 추이 (NAVER API HUB).
 * 🔴 검색어트렌드와 같은 NCP 키 재사용: NAVER_CLIENT_ID / NAVER_CLIENT_SECRET.
 * 대분류 전체의 12개월 클릭 추이 → "뜨는 분야/지는 분야" 대시보드.
 * (연령/성별은 호출별 정규화 문제로 신뢰도 낮아 미제공.)
 */
import type { Trend } from "@/lib/naver-datalab";

const INSIGHT_URL = "https://naverapihub.apigw.ntruss.com/shopping/v1/categories";

/** 네이버쇼핑 1depth 대분류 + cat_id. */
export const NAVER_CATEGORIES: { name: string; cid: string }[] = [
  { name: "패션의류", cid: "50000000" },
  { name: "패션잡화", cid: "50000001" },
  { name: "화장품/미용", cid: "50000002" },
  { name: "디지털/가전", cid: "50000003" },
  { name: "가구/인테리어", cid: "50000004" },
  { name: "출산/육아", cid: "50000005" },
  { name: "식품", cid: "50000006" },
  { name: "스포츠/레저", cid: "50000007" },
  { name: "생활/건강", cid: "50000008" },
  { name: "여가/생활편의", cid: "50000009" },
];

export type CategoryTrend = { name: string; cid: string } & Trend;

export function insightConfigured(): boolean {
  return !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
}

const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

/** 최근 n개월 평균 vs 작년 같은 n개월 평균(계절 상쇄, YoY). series는 완료월 24개. */
function yoy(series: number[], n: number): Pt {
  if (series.length < n + 12) return { direction: "flat", changePct: null };
  const recent = series.slice(series.length - n);
  const prior = series.slice(series.length - n - 12, series.length - 12);
  const a = avg(recent);
  const b = avg(prior);
  if (b <= 0) return { direction: "flat", changePct: null };
  const changePct = Math.round(((a - b) / b) * 100);
  const direction: Trend["direction"] = changePct >= 10 ? "up" : changePct <= -10 ? "down" : "flat";
  return { direction, changePct };
}

export type Pt = { direction: Trend["direction"]; changePct: number | null };
export type CategoryMulti = {
  name: string;
  cid: string;
  p3: Pt; // 최근 3개월 전년비
  p6: Pt;
  p12: Pt;
  series: number[]; // 최근 12개월 (스파크라인용)
};

/**
 * 대분류별 전년 동기 대비(YoY) 증감을 한 번에.
 * 완료된 달 기준 24개월 월간 데이터 → 3/6/12개월 각각 작년 같은 기간과 비교(계절 상쇄).
 */
export async function allCategoryTrendsMulti(): Promise<CategoryMulti[]> {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) return [];

  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), 0); // 지난달 말일(이번 달 미완성 제외)
  const start = new Date(end.getFullYear(), end.getMonth() - 23, 1); // 24개월 전 1일
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const batches: { name: string; cid: string }[][] = [];
  for (let i = 0; i < NAVER_CATEGORIES.length; i += 3) batches.push(NAVER_CATEGORIES.slice(i, i + 3));

  const reqs = batches.map(async (batch) => {
    const r = await fetch(INSIGHT_URL, {
      method: "POST",
      headers: {
        "X-NCP-APIGW-API-KEY-ID": id,
        "X-NCP-APIGW-API-KEY": secret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate: fmt(start),
        endDate: fmt(end),
        timeUnit: "month",
        category: batch.map((c) => ({ name: c.name, param: [c.cid] })),
      }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new Error(`쇼핑인사이트 오류 ${r.status}: ${body.slice(0, 160)}`);
    }
    const j = (await r.json()) as { results?: Array<{ data?: Array<{ ratio: number }> }> };
    return (j.results ?? []).map((res, idx) => {
      const cat = batch[idx];
      const series = (res.data ?? []).map((d) => d.ratio);
      return {
        name: cat.name,
        cid: cat.cid,
        p3: yoy(series, 3),
        p6: yoy(series, 6),
        p12: yoy(series, 12),
        series: series.slice(-12),
      } as CategoryMulti;
    });
  });

  const settled = await Promise.allSettled(reqs);
  const ok = settled
    .filter((s) => s.status === "fulfilled")
    .flatMap((s) => (s as PromiseFulfilledResult<CategoryMulti[]>).value);
  if (ok.length === 0) {
    const firstErr = settled.find((s) => s.status === "rejected") as PromiseRejectedResult | undefined;
    if (firstErr) throw firstErr.reason;
  }

  // 🔴 네이버쇼핑 전체 클릭이 YoY로 하락세 → 절대 YoY는 전 분야가 -로 깔림.
  // 전 분야 평균을 빼서 "상대 성과"로 변환: +면 시장평균보다 선전(상대적으로 뜨는 분야).
  const keys = ["p3", "p6", "p12"] as const;
  const means: Record<string, number> = {};
  for (const k of keys) {
    const vals = ok.map((c) => c[k].changePct).filter((v): v is number => v != null);
    means[k] = vals.length ? avg(vals) : 0;
  }
  const rel = (p: Pt, k: (typeof keys)[number]): Pt => {
    if (p.changePct == null) return p;
    const r = Math.round(p.changePct - means[k]);
    return { changePct: r, direction: r >= 5 ? "up" : r <= -5 ? "down" : "flat" };
  };
  return ok.map((c) => ({ ...c, p3: rel(c.p3, "p3"), p6: rel(c.p6, "p6"), p12: rel(c.p12, "p12") }));
}
