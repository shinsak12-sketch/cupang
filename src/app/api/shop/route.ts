import { NextRequest, NextResponse } from "next/server";
import { shopSearch, shopConfigured } from "@/lib/naver-shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 네이버 쇼핑검색 — 키워드 시장가(상품수·최저·중앙값). */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ error: "키워드(q) 필요" }, { status: 400 });
  if (!shopConfigured()) {
    return NextResponse.json(
      { error: "네이버 쇼핑검색 키 미설정 (NAVER_SEARCH_ID / NAVER_SEARCH_SECRET)" },
      { status: 500 }
    );
  }
  try {
    const r = await shopSearch(q);
    return NextResponse.json(r ?? { total: 0, min: null, max: null, median: null, items: [] });
  } catch (e) {
    return NextResponse.json(
      { error: `쇼핑검색 호출 실패: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }
}
