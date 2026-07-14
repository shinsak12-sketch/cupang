import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { calcCashflow } from "@/lib/calc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  investmentKrw: z.number().nonnegative(),
  orderQty: z.number().int().positive(),
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  inboundDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  monthlySalesQty: z.number().int().positive(),
  settlementPerUnit: z.number(),
  settlementLagDays: z.number().int().nonnegative().optional(),
  sellStartOffsetDays: z.number().int().nonnegative().optional(),
});

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  return NextResponse.json(calcCashflow({ inboundDate: null, ...parsed.data }));
}
