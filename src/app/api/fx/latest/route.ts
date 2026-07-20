import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 3600; // 1시간 캐시

/**
 * CNY→KRW 환율. 🔴 기본값 = "현찰 살 때"(cashBuyingPrice).
 * 1차 두나무(하나은행 기반, 네이버 금융이 쓰는 공개 API) — 현찰/전신환/매매기준율 제공.
 * 2차 frankfurter(ECB, 매매기준율만) — 현찰 미제공시 base 로만 응답.
 * 실패시 rate=null → 클라이언트 기본값 유지.
 */
export async function GET() {
  // 1) 두나무 (현찰 살 때 포함)
  try {
    const r = await fetch(
      "https://quotation-api-cdn.dunamu.com/v1/forex/recent?codes=FRX.KRWCNY",
      { next: { revalidate: 3600 } }
    );
    if (r.ok) {
      const arr = (await r.json()) as Array<{
        basePrice?: number;
        cashBuyingPrice?: number;
        cashSellingPrice?: number;
        ttBuyingPrice?: number;
        currencyUnit?: number;
        date?: string;
        time?: string;
      }>;
      const d = arr?.[0];
      const unit = d?.currencyUnit || 1;
      if (d?.cashBuyingPrice) {
        return NextResponse.json({
          rate: Math.round((d.cashBuyingPrice / unit) * 100) / 100,
          kind: "cash_buying", // 현찰 살 때
          base: d.basePrice ? Math.round((d.basePrice / unit) * 100) / 100 : null,
          cashSelling: d.cashSellingPrice ? Math.round((d.cashSellingPrice / unit) * 100) / 100 : null,
          date: d.date ?? null,
          source: "dunamu",
        });
      }
    }
  } catch {
    /* fallthrough */
  }
  // 2) frankfurter (매매기준율만)
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
          kind: "base", // 매매기준율(현찰 미제공)
          base: Math.round(rate * 100) / 100,
          date: j.date ?? null,
          source: "frankfurter",
        });
      }
    }
  } catch {
    /* fallthrough */
  }
  return NextResponse.json({ rate: null, kind: null, base: null, date: null, source: "unavailable" });
}
