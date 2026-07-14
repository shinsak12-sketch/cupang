import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import {
  resolveSizeRules,
  resolveAssumptions,
  resolvePromoContext,
  resolveLogisticsBySize,
  resolveMisc,
  resolveCategory,
} from "@/lib/resolve";
import { optimizeSetSize } from "@/lib/calc";
import { todayIso } from "@/lib/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  landedCostPerUnit: z.number().nonnegative(),
  candidateQtys: z.array(z.number().int().positive()).min(1).default([1, 3, 5, 10]),
  targetMarginRate: z.number().default(20),
  saverEnabled: z.boolean().default(false),
  promoApplied: z.boolean().default(false),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  disposalCost: z.number().nonnegative().default(0),
});

/** 세트 최적화 — 족수별 사이즈/가격/마진 트레이드오프 (양말 핵심 기능) */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const pid = Number(id);
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const b = parsed.data;
  const asOf = b.asOfDate ?? todayIso();

  const product = await db.query.product.findFirst({ where: (t, { eq }) => eq(t.id, pid) });
  if (!product) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!product.pkgWMm || !product.pkgDMm || !product.pkgHMm || !product.pkgWeightG) {
    return NextResponse.json(
      { error: "낱개 포장 치수/무게가 필요합니다. 상품 기본정보를 먼저 입력하세요." },
      { status: 400 }
    );
  }

  const category = product.categoryId
    ? await db.query.feeCategory.findFirst({ where: (t, { eq }) => eq(t.id, product.categoryId!) })
    : null;
  const cat = await resolveCategory(product.categoryId, asOf);
  const rules = await resolveSizeRules(asOf);
  const logisticsBySize = await resolveLogisticsBySize(asOf);
  const misc = await resolveMisc(asOf);
  const assumptions = await resolveAssumptions(pid, category?.major ?? null);
  const promoCtx = await resolvePromoContext(asOf, b.saverEnabled, b.promoApplied);

  const result = optimizeSetSize({
    // setQty 는 1족 기준으로 넘기고, 낱개 치수를 사용
    unitDims: { wMm: product.pkgWMm, dMm: product.pkgDMm, hMm: product.pkgHMm },
    unitWeightG: product.pkgWeightG,
    landedCostPerUnit: b.landedCostPerUnit,
    candidateQtys: b.candidateQtys,
    targetMarginRate: b.targetMarginRate,
    asOfDate: asOf,
    sizeRules: rules,
    logisticsBySize,
    tablesBase: {
      commissionRatePct: cat?.commissionRatePct ?? 10.5,
      serviceFeeThreshold: cat?.serviceFeeThreshold ?? 1_000_000,
      misc,
      serviceFeeAmount: Number(misc["service_fee"]?.amount ?? 55000),
    },
    promoCtx,
    assumption: assumptions.base,
    returnResalable: product.returnResalable,
    disposalCost: b.disposalCost,
  });

  return NextResponse.json({ asOf, sizeRulesConfigured: rules.length > 0, result });
}
