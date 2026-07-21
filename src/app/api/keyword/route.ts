import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 네이버 검색광고 키워드도구 API — 월간 검색수/경쟁정도/연관키워드.
 * 🔴 쿠팡 검색량은 비공개 → 네이버를 국내 쇼핑 검색량 프록시로 사용.
 * env: NAVER_API_KEY(액세스라이선스), NAVER_SECRET_KEY(비밀키), NAVER_CUSTOMER_ID(고객ID)
 */
const BASE = "https://api.searchad.naver.com";

function parseCnt(v: unknown): number {
  // "< 10" 같은 문자열 처리
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    if (v.includes("<")) return 5; // 10 미만 → 근사 5
    const n = Number(v.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export async function GET(req: NextRequest) {
  const keyword = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!keyword) return NextResponse.json({ error: "키워드(q)를 입력하세요" }, { status: 400 });

  const apiKey = process.env.NAVER_API_KEY;
  const secret = process.env.NAVER_SECRET_KEY;
  const customer = process.env.NAVER_CUSTOMER_ID;
  if (!apiKey || !secret || !customer) {
    return NextResponse.json(
      { error: "네이버 API 키 미설정 (NAVER_API_KEY / NAVER_SECRET_KEY / NAVER_CUSTOMER_ID)" },
      { status: 500 }
    );
  }

  const timestamp = String(Date.now());
  const method = "GET";
  const path = "/keywordstool";
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${method}.${path}`)
    .digest("base64");

  const hint = keyword.replace(/\s+/g, "");
  const url = `${BASE}${path}?hintKeywords=${encodeURIComponent(hint)}&showDetail=1`;

  try {
    const r = await fetch(url, {
      headers: {
        "X-Timestamp": timestamp,
        "X-API-KEY": apiKey,
        "X-Customer": customer,
        "X-Signature": signature,
      },
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      return NextResponse.json(
        { error: `네이버 API 오류 ${r.status}`, detail: body.slice(0, 300) },
        { status: 502 }
      );
    }
    const data = (await r.json()) as {
      keywordList?: Array<{
        relKeyword: string;
        monthlyPcQcCnt: number | string;
        monthlyMobileQcCnt: number | string;
        monthlyAvePcClkCnt?: number;
        monthlyAveMobileClkCnt?: number;
        compIdx?: string;
      }>;
    };

    const rows = (data.keywordList ?? [])
      .map((k) => {
        const pc = parseCnt(k.monthlyPcQcCnt);
        const mobile = parseCnt(k.monthlyMobileQcCnt);
        return {
          keyword: k.relKeyword,
          pc,
          mobile,
          total: pc + mobile,
          clicks: Math.round((k.monthlyAvePcClkCnt ?? 0) + (k.monthlyAveMobileClkCnt ?? 0)),
          comp: k.compIdx ?? "-",
        };
      })
      .sort((a, b) => b.total - a.total);

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
