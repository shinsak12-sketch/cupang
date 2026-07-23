/**
 * 네이버 쇼핑인사이트 — 분야(카테고리)별 클릭 추이 (NAVER API HUB).
 * 🔴 검색어트렌드와 같은 NCP 키 재사용: NAVER_CLIENT_ID / NAVER_CLIENT_SECRET.
 * 카테고리 12개월 클릭 추이로 "이 분야 뜨는 중/지는 중" 판단.
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

export function insightConfigured(): boolean {
  return !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
}

export async function categoryTrend(cid: string, name: string): Promise<Trend | null> {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) return null;

  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - 11);
  start.setDate(1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

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
      category: [{ name, param: [cid] }],
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`쇼핑인사이트 오류 ${r.status}: ${body.slice(0, 160)}`);
  }
  const j = (await r.json()) as { results?: Array<{ data?: Array<{ ratio: number }> }> };
  const series = (j.results?.[0]?.data ?? []).map((d) => d.ratio);
  if (series.length < 4) return { direction: "flat", changePct: null, series };

  const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  const first = avg(series.slice(0, 3));
  const last = avg(series.slice(-3));
  const changePct = first > 0 ? Math.round(((last - first) / first) * 100) : null;
  const direction: Trend["direction"] =
    changePct == null ? "flat" : changePct >= 15 ? "up" : changePct <= -15 ? "down" : "flat";
  return { direction, changePct, series };
}
