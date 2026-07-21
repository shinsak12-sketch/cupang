import crypto from "node:crypto";

/**
 * 네이버 검색광고 키워드도구 API 공용 헬퍼.
 * 🔴 쿠팡 검색량은 비공개 → 네이버를 국내 쇼핑 검색량 프록시로 사용.
 * env: NAVER_API_KEY(액세스라이선스), NAVER_SECRET_KEY(비밀키), NAVER_CUSTOMER_ID(고객ID)
 */
const BASE = "https://api.searchad.naver.com";

export type KeywordStat = {
  keyword: string;
  pc: number;
  mobile: number;
  total: number;
  clicks: number;
  comp: string;
};

export function naverConfigured(): boolean {
  return !!(process.env.NAVER_API_KEY && process.env.NAVER_SECRET_KEY && process.env.NAVER_CUSTOMER_ID);
}

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

function sign(secret: string, timestamp: string, method: string, path: string): string {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${method}.${path}`).digest("base64");
}

/**
 * 힌트 키워드(최대 5개) → 키워드도구 조회. 연관 키워드 포함 전체 rows 반환.
 */
export async function keywordTool(hints: string[]): Promise<KeywordStat[]> {
  const apiKey = process.env.NAVER_API_KEY!;
  const secret = process.env.NAVER_SECRET_KEY!;
  const customer = process.env.NAVER_CUSTOMER_ID!;

  const timestamp = String(Date.now());
  const path = "/keywordstool";
  const signature = sign(secret, timestamp, "GET", path);

  const hintParam = hints.map((h) => h.replace(/\s+/g, "")).join(",");
  const url = `${BASE}${path}?hintKeywords=${encodeURIComponent(hintParam)}&showDetail=1`;

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
    throw new Error(`네이버 API 오류 ${r.status}: ${body.slice(0, 200)}`);
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

  return (data.keywordList ?? [])
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
}

/**
 * 여러 키워드의 "정확 일치" 검색량만 뽑아 map으로 반환.
 * 5개씩 배치로 키워드도구를 호출한다(힌트 최대 5개 제한).
 */
export async function getVolumes(keywords: string[]): Promise<Map<string, KeywordStat>> {
  const out = new Map<string, KeywordStat>();
  const uniq = [...new Set(keywords.map((k) => k.trim()).filter(Boolean))];

  const batches: string[][] = [];
  for (let i = 0; i < uniq.length; i += 5) batches.push(uniq.slice(i, i + 5));

  const results = await Promise.allSettled(batches.map((b) => keywordTool(b)));

  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  const want = new Map(uniq.map((k) => [norm(k), k]));

  for (const res of results) {
    if (res.status !== "fulfilled") continue;
    for (const row of res.value) {
      const key = norm(row.keyword);
      const orig = want.get(key);
      if (orig && !out.has(orig)) out.set(orig, row);
    }
  }
  return out;
}
