import { NextRequest, NextResponse } from "next/server";
import { categoryTrend, insightConfigured, NAVER_CATEGORIES } from "@/lib/naver-insight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 네이버 쇼핑인사이트 — 분야(카테고리) 12개월 클릭 추이. */
export async function GET(req: NextRequest) {
  const cid = (req.nextUrl.searchParams.get("cid") ?? "").trim();
  const cat = NAVER_CATEGORIES.find((c) => c.cid === cid);
  if (!cat) return NextResponse.json({ error: "유효한 분야(cid) 필요" }, { status: 400 });
  if (!insightConfigured()) {
    return NextResponse.json(
      { error: "쇼핑인사이트 키 미설정 (NAVER_CLIENT_ID / NAVER_CLIENT_SECRET)" },
      { status: 500 }
    );
  }
  try {
    const t = await categoryTrend(cat.cid, cat.name);
    return NextResponse.json(t ?? { direction: "flat", changePct: null, series: [] });
  } catch (e) {
    return NextResponse.json(
      { error: `쇼핑인사이트 호출 실패: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }
}
