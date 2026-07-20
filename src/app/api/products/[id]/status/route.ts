import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 후보(검토중) → 판매중(판매등록) / 중단(폐기) 전환
const bodySchema = z.object({
  status: z.enum(["검토중", "발주", "판매중", "중단"]),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await db
    .update(schema.product)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(eq(schema.product.id, Number(id)));

  return NextResponse.json({ ok: true });
}
