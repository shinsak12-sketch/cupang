import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { prevDay } from "@/lib/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — 현재 유효 물류비 매트릭스
export async function GET() {
  const rows = await db
    .select()
    .from(schema.feeLogistics)
    .where(isNull(schema.feeLogistics.effectiveTo))
    .orderBy(asc(schema.feeLogistics.sizeType));
  return NextResponse.json({ rows });
}

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("verify"), id: z.number().int() }),
  z.object({
    action: z.literal("update"),
    id: z.number().int(),
    inboundFee: z.number().int().nonnegative(),
    shippingFee: z.number().int().nonnegative(),
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    isVerified: z.boolean().optional(),
  }),
]);

export async function PATCH(req: NextRequest) {
  const body = patchSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }
  const data = body.data;

  if (data.action === "verify") {
    await db
      .update(schema.feeLogistics)
      .set({ isVerified: true, updatedAt: new Date() })
      .where(eq(schema.feeLogistics.id, data.id));
    return NextResponse.json({ ok: true });
  }

  const cur = await db.query.feeLogistics.findFirst({
    where: (t, { eq: e }) => e(t.id, data.id),
  });
  if (!cur) return NextResponse.json({ error: "not found" }, { status: 404 });

  await db
    .update(schema.feeLogistics)
    .set({ effectiveTo: prevDay(data.effectiveFrom) })
    .where(and(eq(schema.feeLogistics.id, data.id), isNull(schema.feeLogistics.effectiveTo)));

  const [inserted] = await db
    .insert(schema.feeLogistics)
    .values({
      sizeType: cur.sizeType,
      categoryGroup: cur.categoryGroup,
      priceMin: cur.priceMin,
      priceMax: cur.priceMax,
      inboundFee: data.inboundFee,
      shippingFee: data.shippingFee,
      effectiveFrom: data.effectiveFrom,
      isVerified: data.isVerified ?? true,
      source: "manual",
    })
    .returning();

  return NextResponse.json({ ok: true, row: inserted });
}
