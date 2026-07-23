import { NextResponse } from "next/server";
import { allCategoryTrendsMulti, insightConfigured } from "@/lib/naver-insight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 네이버 쇼핑인사이트 — 대분류별 3·6·12개월 추이 한 번에(대시보드). */
export async function GET() {
  if (!insightConfigured()) {
    return NextResponse.json(
      { error: "쇼핑인사이트 키 미설정 (NAVER_CLIENT_ID / NAVER_CLIENT_SECRET)" },
      { status: 500 }
    );
  }
  try {
    const items = await allCategoryTrendsMulti();
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json(
      { error: `쇼핑인사이트 호출 실패: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }
}
