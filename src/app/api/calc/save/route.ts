import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 마진계산 결과 저장 → 상품(후보/검토중) + price_plan(계산 스냅샷). productId 있으면 수정. */
const bodySchema = z.object({
  productId: z.number().int().optional(), // 있으면 수정
  name: z.string().min(1, "상품명을 입력하세요"),
  sourceUrl: z.string().url().optional().or(z.literal("")),
  categoryId: z.number().int().nullable().optional(),
  salePrice: z.number().nonnegative(),
  landedCost: z.number().nonnegative(),
  snapshot: z.record(z.string(), z.unknown()),
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
  const snapshot = { ...d.snapshot, landedCost: d.landedCost };

  // 수정 모드
  if (d.productId) {
    await db
      .update(schema.product)
      .set({
        name: d.name,
        sourceUrl,
        sourceOfferId: parseOfferId(sourceUrl),
        categoryId: d.categoryId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.product.id, d.productId));
    // 기존 활성 플랜 비활성화 후 새 플랜
    await db
      .update(schema.pricePlan)
      .set({ isActive: false })
      .where(and(eq(schema.pricePlan.productId, d.productId), eq(schema.pricePlan.isActive, true)));
    await db.insert(schema.pricePlan).values({
      productId: d.productId,
      listPrice: String(d.salePrice),
      finalPrice: String(d.salePrice),
      calcSnapshot: snapshot,
      isActive: true,
    });
    return NextResponse.json({ ok: true, productId: d.productId });
  }

  // 신규
  const [product] = await db
    .insert(schema.product)
    .values({
      name: d.name,
      status: "검토중",
      sourceUrl,
      sourceOfferId: parseOfferId(sourceUrl),
      categoryId: d.categoryId ?? null,
    })
    .returning();

  await db.insert(schema.pricePlan).values({
    productId: product.id,
    listPrice: String(d.salePrice),
    finalPrice: String(d.salePrice),
    calcSnapshot: snapshot,
    isActive: true,
  });

  return NextResponse.json({ ok: true, productId: product.id });
}
