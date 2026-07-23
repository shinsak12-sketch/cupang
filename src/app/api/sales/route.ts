import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/sales?productId=1 → 월별 실적
export async function GET(req: NextRequest) {
  const productId = Number(req.nextUrl.searchParams.get("productId"));
  if (!productId) return NextResponse.json({ error: "productId 필요" }, { status: 400 });
  const rows = await db
    .select()
    .from(schema.salesActual)
    .where(eq(schema.salesActual.productId, productId))
    .orderBy(desc(schema.salesActual.ym));
  return NextResponse.json({ rows });
}

const postSchema = z.object({
  productId: z.number().int(),
  ym: z.string().regex(/^\d{4}-\d{2}$/),
  soldQty: z.number().int().nonnegative(),
  returnedQty: z.number().int().nonnegative().default(0),
  grossRevenue: z.number().nonnegative().nullable().optional(),
  settlementAmount: z.number().nullable().optional(), // 실제 순이익(월)
});

// POST — (productId, ym) 기준 upsert
export async function POST(req: NextRequest) {
  const parsed = postSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const existing = await db.query.salesActual.findFirst({
    where: (t, { eq: e, and: a }) => a(e(t.productId, d.productId), e(t.ym, d.ym)),
  });
  if (existing) {
    await db
      .update(schema.salesActual)
      .set({
        soldQty: d.soldQty,
        returnedQty: d.returnedQty,
        grossRevenue: d.grossRevenue != null ? String(d.grossRevenue) : null,
        settlementAmount: d.settlementAmount != null ? String(d.settlementAmount) : null,
      })
      .where(eq(schema.salesActual.id, existing.id));
  } else {
    await db.insert(schema.salesActual).values({
      productId: d.productId,
      ym: d.ym,
      soldQty: d.soldQty,
      returnedQty: d.returnedQty,
      grossRevenue: d.grossRevenue != null ? String(d.grossRevenue) : null,
      settlementAmount: d.settlementAmount != null ? String(d.settlementAmount) : null,
    });
  }
  return NextResponse.json({ ok: true });
}

// DELETE /api/sales?id=1
export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id 필요" }, { status: 400 });
  await db.delete(schema.salesActual).where(eq(schema.salesActual.id, id));
  return NextResponse.json({ ok: true });
}
