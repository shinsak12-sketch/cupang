import { NextRequest, NextResponse } from "next/server";
import { keywordTool, naverConfigured } from "@/lib/naver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 네이버 검색광고 키워드도구 API — 월간 검색수/경쟁정도/연관키워드.
 * 🔴 쿠팡 검색량은 비공개 → 네이버를 국내 쇼핑 검색량 프록시로 사용.
 */
export async function GET(req: NextRequest) {
  const keyword = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!keyword) return NextResponse.json({ error: "키워드(q)를 입력하세요" }, { status: 400 });

  if (!naverConfigured()) {
    return NextResponse.json(
      { error: "네이버 API 키 미설정 (NAVER_API_KEY / NAVER_SECRET_KEY / NAVER_CUSTOMER_ID)" },
      { status: 500 }
    );
  }

  const hint = keyword.replace(/\s+/g, "");
  try {
    const rows = await keywordTool([hint]);
    // 정확 일치 키워드를 맨 앞으로
    const exactIdx = rows.findIndex((r2) => r2.keyword.replace(/\s+/g, "") === hint);
    if (exactIdx > 0) rows.unshift(rows.splice(exactIdx, 1)[0]);
    return NextResponse.json({ keyword, rows: rows.slice(0, 40) });
  } catch (e) {
    return NextResponse.json(
      { error: `네이버 API 호출 실패: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }
}
