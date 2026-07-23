import { NextRequest, NextResponse } from "next/server";
import { getSearchTrend, datalabConfigured } from "@/lib/naver-datalab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 네이버 데이터랩 검색어 트렌드 — 최근 12개월 수요 추이(상승/하락). */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();

  // ?debug=1 → 서버가 실제로 쓰는 Client ID 앞/뒤 일부를 보여줘 앱 매칭 확인
  if (req.nextUrl.searchParams.get("debug") === "1") {
    const id = process.env.NAVER_CLIENT_ID ?? "";
    const secret = process.env.NAVER_CLIENT_SECRET ?? "";
    const mask = (s: string) => (s ? `${s.slice(0, 4)}…${s.slice(-2)} (len ${s.length})` : "(없음)");
    return NextResponse.json({
      clientIdSet: !!id,
      clientSecretSet: !!secret,
      clientId: mask(id),
      clientSecretTail: secret ? `…${secret.slice(-2)} (len ${secret.length})` : "(없음)",
    });
  }

  if (!q) return NextResponse.json({ error: "키워드(q) 필요" }, { status: 400 });
  if (!datalabConfigured()) {
    return NextResponse.json(
      { error: "데이터랩 키 미설정 (NAVER_CLIENT_ID / NAVER_CLIENT_SECRET)" },
      { status: 500 }
    );
  }
  try {
    const t = await getSearchTrend(q);
    return NextResponse.json(t ?? { direction: "flat", changePct: null, series: [] });
  } catch (e) {
    return NextResponse.json(
      { error: `데이터랩 호출 실패: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }
}
