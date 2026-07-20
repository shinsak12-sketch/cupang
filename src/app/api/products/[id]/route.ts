import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db, schema } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const pid = Number(id);
  // 상품 + 최신 활성 플랜 병렬 조회
  const [product, plan] = await Promise.all([
    db.query.product.findFirst({ where: (t, { eq: e }) => e(t.id, pid) }),
    db.query.pricePlan.findFirst({
      where: (t, { eq: e, and }) => and(e(t.productId, pid), e(t.isActive, true)),
      orderBy: (t) => [desc(t.createdAt)],
    }),
  ]);
  if (!product) return NextResponse.json({ error: "not found" }, { status: 404 });

  const category = product.categoryId
    ? await db.query.feeCategory.findFirst({ where: (t, { eq: e }) => e(t.id, product.categoryId!) })
    : null;

  return NextResponse.json({
    product,
    category,
    salePrice: plan?.finalPrice ? Number(plan.finalPrice) : null,
    snapshot: plan?.calcSnapshot ?? null,
  });
}

// DELETE — 상품 삭제
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await db.delete(schema.product).where(eq(schema.product.id, Number(id)));
  return NextResponse.json({ ok: true });
}
