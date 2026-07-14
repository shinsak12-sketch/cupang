import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
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
  const lots = await db.select().from(schema.lot).where(eq(schema.lot.productId, pid));

  return NextResponse.json({ product, category, lots });
}
