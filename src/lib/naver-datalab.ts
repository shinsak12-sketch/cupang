/**
 * 네이버 클라우드(NCP) 데이터랩 검색어 트렌드 API.
 * 🔴 console.ncloud.com > AI·NAVER API > Application 의 "인증 정보"(Client ID/Secret)를 사용.
 * env: NAVER_CLIENT_ID(=NCP Client ID), NAVER_CLIENT_SECRET(=NCP Client Secret)
 * 최근 12개월 상대 검색량 추이로 "수요가 오르는지/내리는지" 판단.
 */
const NCP_DATALAB = "https://naverapihub.apigw.ntruss.com/search-trend/v1/search";

export function datalabConfigured(): boolean {
  return !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
}

export type Trend = {
  direction: "up" | "flat" | "down";
  changePct: number | null; // 초기 3개월 평균 대비 최근 3개월 평균 변화율(%)
  series: number[]; // 월별 상대지수(0~100)
};

export async function getSearchTrend(keyword: string): Promise<Trend | null> {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) return null;

  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - 11);
  start.setDate(1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const r = await fetch(NCP_DATALAB, {
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
      keywordGroups: [{ groupName: keyword, keywords: [keyword] }],
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`데이터랩 오류 ${r.status}: ${body.slice(0, 160)}`);
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
