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

function direction(series: number[]): Trend {
  if (series.length < 4) return { direction: "flat", changePct: null, series };
  const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  const first = avg(series.slice(0, 3));
  const last = avg(series.slice(-3));
  const changePct = first > 0 ? Math.round(((last - first) / first) * 100) : null;
  const dir: Trend["direction"] =
    changePct == null ? "flat" : changePct >= 15 ? "up" : changePct <= -15 ? "down" : "flat";
  return { direction: dir, changePct, series };
}

/** 대분류 전체 추이 (요청당 최대 3개 → 배치 병렬). months: 3|6|12 */
export async function allCategoryTrends(months = 12): Promise<CategoryTrend[]> {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) return [];

  const timeUnit = months >= 12 ? "month" : "week"; // 짧으면 주간(점 촘촘)
  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - months);
  if (timeUnit === "month") start.setDate(1);
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
        timeUnit,
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
      return { name: cat.name, cid: cat.cid, ...direction(series) };
    });
  });

  const settled = await Promise.allSettled(reqs);
  const ok = settled.filter((s) => s.status === "fulfilled").flatMap((s) => (s as PromiseFulfilledResult<CategoryTrend[]>).value);
  if (ok.length === 0) {
    const firstErr = settled.find((s) => s.status === "rejected") as PromiseRejectedResult | undefined;
    if (firstErr) throw firstErr.reason;
  }
  return ok;
}

export type Pt = { direction: Trend["direction"]; changePct: number | null };
export type CategoryMulti = {
  name: string;
  cid: string;
  p3: Pt;
  p6: Pt;
  p12: Pt;
  series: number[]; // 12개월 스파크라인용
};

/** 대분류별 3·6·12개월 추이를 한 번에. */
export async function allCategoryTrendsMulti(): Promise<CategoryMulti[]> {
  const [r3, r6, r12] = await Promise.allSettled([
    allCategoryTrends(3),
    allCategoryTrends(6),
    allCategoryTrends(12),
  ]);
  const val = (r: PromiseSettledResult<CategoryTrend[]>) =>
    r.status === "fulfilled" ? r.value : [];
  if (val(r3).length === 0 && val(r6).length === 0 && val(r12).length === 0) {
    const err = [r3, r6, r12].find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    if (err) throw err.reason;
  }
  const by = (arr: CategoryTrend[]) => new Map(arr.map((x) => [x.cid, x]));
  const m3 = by(val(r3));
  const m6 = by(val(r6));
  const m12 = by(val(r12));
  const pt = (t?: CategoryTrend): Pt => (t ? { direction: t.direction, changePct: t.changePct } : { direction: "flat", changePct: null });

  return NAVER_CATEGORIES.map((c) => ({
    name: c.name,
    cid: c.cid,
    p3: pt(m3.get(c.cid)),
    p6: pt(m6.get(c.cid)),
    p12: pt(m12.get(c.cid)),
    series: m12.get(c.cid)?.series ?? [],
  }));
}
