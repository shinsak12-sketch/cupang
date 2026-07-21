import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getServerEnv } from "@/lib/env";
import { estimateSales } from "@/lib/sales-estimate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ---- CORS (쿠팡 북마클릿) ---- */
function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && /^https:\/\/([a-z0-9-]+\.)*coupang\.com$/.test(origin);
  return {
    "Access-Control-Allow-Origin": allow ? origin! : "https://www.coupang.com",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

const itemSchema = z.object({
  productId: z.string().optional(),
  name: z.string().optional(),
  price: z.number().nonnegative().optional(),
  rating: z.number().optional(),
  reviewCount: z.number().int().nonnegative().optional(),
  isRocket: z.boolean().optional(),
  isPb: z.boolean().optional(),
  rank: z.number().int().optional(),
});
const postSchema = z.object({ keyword: z.string().min(1), items: z.array(itemSchema).max(200) });

// POST — 북마클릿이 쿠팡 검색결과 수집 → 저장 (token 검증)
export async function POST(req: NextRequest) {
  const headers = corsHeaders(req.headers.get("origin"));
  const token = req.nextUrl.searchParams.get("token");
  if (!token || token !== getServerEnv().INGEST_TOKEN) {
    return NextResponse.json({ error: "invalid token" }, { status: 401, headers });
  }
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid payload" }, { status: 400, headers });

  const { keyword, items } = parsed.data;
  if (items.length > 0) {
    await db.insert(schema.coupangSnapshot).values(
      items.map((it) => ({
        keyword,
        productId: it.productId ?? null,
        name: it.name ?? null,
        price: it.price ?? null,
        rating: it.rating != null ? String(it.rating) : null,
        reviewCount: it.reviewCount ?? null,
        isRocket: it.isRocket ?? false,
        isPb: it.isPb ?? false,
        rank: it.rank ?? null,
      }))
    );
  }
  return NextResponse.json({ ok: true, saved: items.length }, { headers });
}

// GET ?keyword= → 최신 스냅샷 + 상품별 판매량 추정 + 시장 요약
export async function GET(req: NextRequest) {
  const keyword = (req.nextUrl.searchParams.get("keyword") ?? "").trim();
  if (!keyword) return NextResponse.json({ error: "keyword 필요" }, { status: 400 });

  const snaps = await db
    .select()
    .from(schema.coupangSnapshot)
    .where(eq(schema.coupangSnapshot.keyword, keyword))
    .orderBy(desc(schema.coupangSnapshot.collectedAt));

  if (snaps.length === 0) return NextResponse.json({ keyword, items: [], summary: null, collections: 0 });

  // 상품별 그룹
  const byProduct = new Map<string, typeof snaps>();
  for (const s of snaps) {
    const key = s.productId ?? `noid-${s.name}`;
    if (!byProduct.has(key)) byProduct.set(key, []);
    byProduct.get(key)!.push(s);
  }

  const items = [...byProduct.values()].map((group) => {
    const latest = group[0]; // desc 정렬이라 첫번째가 최신
    const est = estimateSales(group.map((g) => ({ reviewCount: g.reviewCount, collectedAt: g.collectedAt })));
    return {
      productId: latest.productId,
      name: latest.name,
      price: latest.price,
      rating: latest.rating ? Number(latest.rating) : null,
      reviewCount: latest.reviewCount,
      isRocket: latest.isRocket,
      isPb: latest.isPb,
      rank: latest.rank,
      estimate: est,
    };
  });
  items.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

  // 시장 요약
  const prices = items.map((i) => i.price ?? 0).filter((p) => p > 0).sort((a, b) => a - b);
  const reviews = items.map((i) => i.reviewCount ?? 0);
  const collectionTimes = new Set(snaps.map((s) => new Date(s.collectedAt).toISOString().slice(0, 10)));
  const summary = {
    count: items.length,
    priceMin: prices[0] ?? null,
    priceMax: prices[prices.length - 1] ?? null,
    priceMedian: prices.length ? prices[Math.floor(prices.length / 2)] : null,
    maxReview: Math.max(0, ...reviews),
    pbCount: items.filter((i) => i.isPb).length,
    rocketCount: items.filter((i) => i.isRocket).length,
    collections: collectionTimes.size,
  };

  return NextResponse.json({ keyword, items, summary, collections: collectionTimes.size });
}
