import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getServerEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 🔴 북마클릿 전용 인제스트 (CLAUDE_CODE_PROMPT §6).
 *  - Basic Auth 제외 (middleware 에서 스킵)
 *  - 대신 ?token=INGEST_TOKEN 검증
 *  - CORS: https://*.1688.com 허용
 * 1688 상품페이지 DOM에서 긁은 원문을 product.source_snapshot 에 저장.
 */

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && /^https:\/\/([a-z0-9-]+\.)*1688\.com$/.test(origin);
  return {
    "Access-Control-Allow-Origin": allow ? origin! : "https://www.1688.com",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

const payloadSchema = z.object({
  offerId: z.string().optional(),
  url: z.string().url().optional(),
  name: z.string().optional(),
  price: z.union([z.string(), z.number()]).optional(),
  supplier: z.string().optional(),
  images: z.array(z.string()).optional(),
  options: z.unknown().optional(),
  raw: z.unknown().optional(),
});

function parseOfferId(url?: string, offerId?: string): string | null {
  if (offerId) return offerId;
  if (!url) return null;
  const m = url.match(/\/offer\/(\d+)\.html/);
  return m ? m[1] : null;
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  // 토큰 검증
  const token = req.nextUrl.searchParams.get("token");
  if (!token || token !== getServerEnv().INGEST_TOKEN) {
    return NextResponse.json({ error: "invalid token" }, { status: 401, headers });
  }

  const parsed = payloadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400, headers });
  }
  const p = parsed.data;
  const offerId = parseOfferId(p.url, p.offerId);

  // offer_id 로 upsert (없으면 새 검토중 상품 생성)
  const existing = offerId
    ? await db.query.product.findFirst({
        where: (t, { eq }) => eq(t.sourceOfferId, offerId),
      })
    : null;

  if (existing) {
    await db
      .update(schema.product)
      .set({
        sourceSnapshot: p as unknown as object,
        sourceUrl: p.url ?? existing.sourceUrl,
        sourceSupplier: p.supplier ?? existing.sourceSupplier,
        imageUrl: p.images?.[0] ?? existing.imageUrl,
        imageUrls: p.images ?? existing.imageUrls,
        updatedAt: new Date(),
      })
      .where(eq(schema.product.id, existing.id));
    return NextResponse.json({ ok: true, productId: existing.id, mode: "updated" }, { headers });
  }

  const [created] = await db
    .insert(schema.product)
    .values({
      name: p.name ?? `1688 상품 ${offerId ?? "(미상)"}`,
      status: "검토중",
      sourceUrl: p.url ?? null,
      sourceOfferId: offerId,
      sourceSupplier: p.supplier ?? null,
      sourceSnapshot: p as unknown as object,
      imageUrl: p.images?.[0] ?? null,
      imageUrls: p.images ?? [],
    })
    .returning();

  return NextResponse.json({ ok: true, productId: created.id, mode: "created" }, { headers });
}
