import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 마진계산 결과 저장 → 상품(후보/검토중) + price_plan(계산 스냅샷) 생성 */
const bodySchema = z.object({
  name: z.string().min(1, "상품명을 입력하세요"),
  sourceUrl: z.string().url().optional().or(z.literal("")),
  categoryId: z.number().int().nullable().optional(),
  salePrice: z.number().nonnegative(),
  landedCost: z.number().nonnegative(),
  snapshot: z.record(z.string(), z.unknown()), // 입력+결과 전체
});

function parseOfferId(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/\/offer\/(\d+)\.html/);
  return m ? m[1] : null;
}

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const sourceUrl = d.sourceUrl && d.sourceUrl !== "" ? d.sourceUrl : null;

  const [product] = await db
    .insert(schema.product)
    .values({
      name: d.name,
      status: "검토중", // 후보
      sourceUrl,
      sourceOfferId: parseOfferId(sourceUrl),
      categoryId: d.categoryId ?? null,
    })
    .returning();

  await db.insert(schema.pricePlan).values({
    productId: product.id,
    listPrice: String(d.salePrice),
    finalPrice: String(d.salePrice),
    calcSnapshot: { ...d.snapshot, landedCost: d.landedCost },
    isActive: true,
  });

  return NextResponse.json({ ok: true, productId: product.id });
}
