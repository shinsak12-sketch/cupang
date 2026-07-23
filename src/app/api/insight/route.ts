import { NextRequest, NextResponse } from "next/server";
import { allCategoryTrends, insightConfigured } from "@/lib/naver-insight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 네이버 쇼핑인사이트 — 대분류 전체 클릭 추이(대시보드). ?months=3|6|12 */
export async function GET(req: NextRequest) {
  if (!insightConfigured()) {
    return NextResponse.json(
      { error: "쇼핑인사이트 키 미설정 (NAVER_CLIENT_ID / NAVER_CLIENT_SECRET)" },
      { status: 500 }
    );
  }
  const m = Number(req.nextUrl.searchParams.get("months"));
  const months = [3, 6, 12].includes(m) ? m : 12;
  try {
    const items = await allCategoryTrends(months);
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json(
      { error: `쇼핑인사이트 호출 실패: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }
}
