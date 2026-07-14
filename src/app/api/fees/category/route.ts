import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { prevDay } from "@/lib/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/fees/category — 현재 유효 카테고리 요율
export async function GET() {
  const rows = await db
    .select()
    .from(schema.feeCategory)
    .where(isNull(schema.feeCategory.effectiveTo))
    .orderBy(asc(schema.feeCategory.major), asc(schema.feeCategory.commissionRate));
  return NextResponse.json({ rows });
}

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("verify"), id: z.number().int() }),
  z.object({
    action: z.literal("reprice"),
    id: z.number().int(),
    commissionRate: z.string().regex(/^\d+(\.\d{1,2})?$/),
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    isVerified: z.boolean().optional(),
  }),
]);

// PATCH — verify(제자리 검증) 또는 reprice(신규 버전 생성 + 기존행 마감)
export async function PATCH(req: NextRequest) {
  const body = patchSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }
  const data = body.data;

  if (data.action === "verify") {
    await db
      .update(schema.feeCategory)
      .set({ isVerified: true, updatedAt: new Date() })
      .where(eq(schema.feeCategory.id, data.id));
    return NextResponse.json({ ok: true });
  }

  // reprice: 기존 행 effective_to 마감 + 새 버전 삽입
  const cur = await db.query.feeCategory.findFirst({
    where: (t, { eq: e }) => e(t.id, data.id),
  });
  if (!cur) return NextResponse.json({ error: "not found" }, { status: 404 });

  await db
    .update(schema.feeCategory)
    .set({ effectiveTo: prevDay(data.effectiveFrom) })
    .where(and(eq(schema.feeCategory.id, data.id), isNull(schema.feeCategory.effectiveTo)));

  const [inserted] = await db
    .insert(schema.feeCategory)
    .values({
      major: cur.major,
      middle: cur.middle,
      minor: cur.minor,
      commissionRate: data.commissionRate,
      isDefault: cur.isDefault,
      rgEligible: cur.rgEligible,
      serviceFeeThreshold: cur.serviceFeeThreshold,
      effectiveFrom: data.effectiveFrom,
      isVerified: data.isVerified ?? true,
      source: "manual",
    })
    .returning();

  return NextResponse.json({ ok: true, row: inserted });
}
