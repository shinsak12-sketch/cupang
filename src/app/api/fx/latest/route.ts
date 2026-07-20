import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 3600; // 1시간 캐시

/**
 * CNY→KRW 최신 환율 (무료 API, 키 불필요). 실패시 rate=null → 클라이언트는 기본값 유지.
 * 1차 frankfurter(ECB), 2차 open.er-api.
 */
export async function GET() {
  // 1) frankfurter
  try {
    const r = await fetch("https://api.frankfurter.app/latest?from=CNY&to=KRW", {
      next: { revalidate: 3600 },
    });
    if (r.ok) {
      const j = (await r.json()) as { rates?: { KRW?: number }; date?: string };
      const rate = j?.rates?.KRW;
      if (rate) {
        return NextResponse.json({
          rate: Math.round(rate * 100) / 100,
          date: j.date ?? null,
          source: "frankfurter",
        });
      }
    }
  } catch {
    /* fallthrough */
  }
  // 2) open.er-api
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/CNY", {
      next: { revalidate: 3600 },
    });
    if (r.ok) {
      const j = (await r.json()) as { rates?: { KRW?: number }; time_last_update_utc?: string };
      const rate = j?.rates?.KRW;
      if (rate) {
        return NextResponse.json({
          rate: Math.round(rate * 100) / 100,
          date: j.time_last_update_utc ?? null,
          source: "er-api",
        });
      }
    }
  } catch {
    /* fallthrough */
  }
  return NextResponse.json({ rate: null, date: null, source: "unavailable" });
}
