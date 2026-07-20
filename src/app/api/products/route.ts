import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // 🔴 N+1 제거: 상품 1쿼리 + 활성 price_plan 1쿼리 → JS 매핑 (Neon 왕복 2회)
  // 목록에 필요한 컬럼만 선택(큰 jsonb 스냅샷 전송 방지)
  const [products, plans] = await Promise.all([
    db
      .select({
        id: schema.product.id,
        name: schema.product.name,
        status: schema.product.status,
        sourceUrl: schema.product.sourceUrl,
        categoryId: schema.product.categoryId,
        updatedAt: schema.product.updatedAt,
      })
      .from(schema.product)
      .orderBy(desc(schema.product.updatedAt)),
    db
      .select({
        productId: schema.pricePlan.productId,
        finalPrice: schema.pricePlan.finalPrice,
        createdAt: schema.pricePlan.createdAt,
        calcSnapshot: schema.pricePlan.calcSnapshot,
      })
      .from(schema.pricePlan)
      .where(eq(schema.pricePlan.isActive, true)),
  ]);

  const planBy = new Map<number, (typeof plans)[number]>();
  for (const pl of plans) {
    if (pl.productId == null) continue;
    const cur = planBy.get(pl.productId);
    if (!cur || (pl.createdAt?.getTime() ?? 0) > (cur.createdAt?.getTime() ?? 0)) {
      planBy.set(pl.productId, pl);
    }
  }

  const rows = products.map((p) => {
    const plan = planBy.get(p.id);
    const snap = (plan?.calcSnapshot ?? null) as {
      result?: { marginRate?: number; marginAfterAd?: number; verdict?: string };
    } | null;
    return {
      ...p,
      salePrice: plan?.finalPrice ? Number(plan.finalPrice) : null,
      marginRate: snap?.result?.marginRate ?? null,
      marginAfterAd: snap?.result?.marginAfterAd ?? null,
      verdict: snap?.result?.verdict ?? null,
    };
  });
  return NextResponse.json({ rows });
}

const createSchema = z.object({
  name: z.string().min(1),
  sourceUrl: z.string().url().optional().or(z.literal("")),
  categoryId: z.number().int().nullable().optional(),
  hsCodeId: z.number().int().nullable().optional(),
  memo: z.string().optional(),
  setQty: z.number().int().positive().default(1),
  returnResalable: z.boolean().default(true),
  pkgWMm: z.number().int().nonnegative().optional(),
  pkgDMm: z.number().int().nonnegative().optional(),
  pkgHMm: z.number().int().nonnegative().optional(),
  pkgWeightG: z.number().int().nonnegative().optional(),
});

/** URL 에서 offer_id 파싱: /offer/(\d+).html */
function parseOfferId(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/\/offer\/(\d+)\.html/);
  return m ? m[1] : null;
}

export async function POST(req: NextRequest) {
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const sourceUrl = d.sourceUrl && d.sourceUrl !== "" ? d.sourceUrl : null;
  const [row] = await db
    .insert(schema.product)
    .values({
      name: d.name,
      memo: d.memo ?? null,
      status: "검토중",
      sourceUrl,
      sourceOfferId: parseOfferId(sourceUrl),
      categoryId: d.categoryId ?? null,
      hsCodeId: d.hsCodeId ?? null,
      setQty: d.setQty,
      returnResalable: d.returnResalable,
      pkgWMm: d.pkgWMm ?? null,
      pkgDMm: d.pkgDMm ?? null,
      pkgHMm: d.pkgHMm ?? null,
      pkgWeightG: d.pkgWeightG ?? null,
    })
    .returning();
  return NextResponse.json({ ok: true, row });
}
