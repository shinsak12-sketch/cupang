import { NextRequest, NextResponse } from "next/server";
import { getVolumes, naverConfigured } from "@/lib/naver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * 키워드 목록 → 네이버 월간 검색량 보강. (무료: 네이버 키만 있으면 됨)
 * 업로드한 발굴 파일에 검색량을 붙이는 용도.
 */
export async function POST(req: NextRequest) {
  let keywords: string[] = [];
  try {
    const b = (await req.json()) as { keywords?: unknown };
    if (Array.isArray(b.keywords)) keywords = b.keywords.filter((k): k is string => typeof k === "string");
  } catch {
    // 무시
  }
  if (keywords.length === 0) return NextResponse.json({ volumes: {} });

  if (!naverConfigured()) {
    return NextResponse.json({ volumes: {}, note: "네이버 API 미설정 — 검색량 없이 표시됩니다." });
  }

  try {
    const m = await getVolumes(keywords);
    const volumes: Record<string, { total: number; comp: string }> = {};
    for (const [k, v] of m) volumes[k] = { total: v.total, comp: v.comp };
    return NextResponse.json({ volumes });
  } catch (e) {
    return NextResponse.json({ volumes: {}, error: e instanceof Error ? e.message : String(e) });
  }
}
