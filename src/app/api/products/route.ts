import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { desc } from "drizzle-orm";
import { db, schema } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const products = await db
    .select()
    .from(schema.product)
    .orderBy(desc(schema.product.updatedAt));

  // 각 상품의 최신 활성 price_plan 에서 마진 스냅샷 첨부
  const rows = await Promise.all(
    products.map(async (p) => {
      const plan = await db.query.pricePlan.findFirst({
        where: (t, { eq: e, and }) => and(e(t.productId, p.id), e(t.isActive, true)),
        orderBy: (t, { desc: d }) => [d(t.createdAt)],
      });
      const snap = (plan?.calcSnapshot ?? null) as { result?: { marginRate?: number; marginAfterAd?: number; verdict?: string } } | null;
      return {
        ...p,
        salePrice: plan?.finalPrice ? Number(plan.finalPrice) : null,
        marginRate: snap?.result?.marginRate ?? null,
        marginAfterAd: snap?.result?.marginAfterAd ?? null,
        verdict: snap?.result?.verdict ?? null,
      };
    })
  );
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
