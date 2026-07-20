import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(schema.promotion).orderBy(asc(schema.promotion.id));
  return NextResponse.json({ rows });
}

const patchSchema = z.object({
  id: z.number().int(),
  myStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

export async function PATCH(req: NextRequest) {
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  await db
    .update(schema.promotion)
    .set({ myStartDate: parsed.data.myStartDate, updatedAt: new Date() })
    .where(eq(schema.promotion.id, parsed.data.id));
  return NextResponse.json({ ok: true });
}
