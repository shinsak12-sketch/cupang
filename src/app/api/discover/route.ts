import { NextRequest, NextResponse } from "next/server";
import { discoverProducts, claudeConfigured } from "@/lib/claude";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * AI 상품 발굴 — Claude가 상품군 후보를 제안하고 네이버 검색량으로 보강 후 랭킹.
 * env: ANTHROPIC_API_KEY (+ 선택: NAVER_API_KEY/SECRET/CUSTOMER_ID)
 */
export async function POST(req: NextRequest) {
  if (!claudeConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY 미설정 — Vercel 환경변수에 추가 후 재배포하세요." },
      { status: 500 }
    );
  }

  let ask = "";
  try {
    const body = (await req.json()) as { ask?: string };
    ask = (body.ask ?? "").trim();
  } catch {
    // 빈 요청 허용 (일반 발굴)
  }

  try {
    const result = await discoverProducts(ask);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: `발굴 실패: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }
}
