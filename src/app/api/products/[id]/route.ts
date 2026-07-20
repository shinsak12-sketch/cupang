import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db, schema } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const pid = Number(id);
  const product = await db.query.product.findFirst({
    where: (t, { eq: e }) => e(t.id, pid),
  });
  if (!product) return NextResponse.json({ error: "not found" }, { status: 404 });

  const category = product.categoryId
    ? await db.query.feeCategory.findFirst({ where: (t, { eq: e }) => e(t.id, product.categoryId!) })
    : null;

  const plan = await db.query.pricePlan.findFirst({
    where: (t, { eq: e, and }) => and(e(t.productId, pid), e(t.isActive, true)),
    orderBy: (t) => [desc(t.createdAt)],
  });

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
