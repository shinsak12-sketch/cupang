import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { analyzeProduct } from "@/lib/analyze";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  finalPrice: z.number().positive(),
  landedCostPerUnit: z.number().nonnegative().nullable().optional(),
  saverEnabled: z.boolean().default(false),
  promoApplied: z.boolean().default(false),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cumulativeRevenue: z.number().nonnegative().default(0),
  disposalCost: z.number().nonnegative().default(0),
});

/**
 * 상품 종합 분석: 사이즈 판정 → 3시나리오 판정(GO/CAUTION/NO-GO) → 프로모션 전후 비교.
 * 🔴 요율/가정은 전부 DB에서 asOfDate 기준으로 해석. 착지원가는 로트값 또는 요청 override.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const result = await analyzeProduct(Number(id), parsed.data);
  if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(result);
}
