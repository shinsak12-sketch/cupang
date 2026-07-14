import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import {
  resolveSizeRules,
  resolveAssumptions,
  resolvePromoContext,
  resolveLandedCost,
  buildCoupangTables,
} from "@/lib/resolve";
import { resolveSize, calcScenarios, comparePromoVsPost } from "@/lib/calc";
import { todayIso } from "@/lib/date";

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
  const pid = Number(id);
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const b = parsed.data;
  const asOf = b.asOfDate ?? todayIso();

  const product = await db.query.product.findFirst({ where: (t, { eq }) => eq(t.id, pid) });
  if (!product) return NextResponse.json({ error: "not found" }, { status: 404 });

  const category = product.categoryId
    ? await db.query.feeCategory.findFirst({ where: (t, { eq }) => eq(t.id, product.categoryId!) })
    : null;

  // 사이즈 판정 (포장 실측 기준)
  const rules = await resolveSizeRules(asOf);
  const dims = {
    wMm: product.pkgWMm ?? 0,
    dMm: product.pkgDMm ?? 0,
    hMm: product.pkgHMm ?? 0,
  };
  const size = resolveSize(dims, product.pkgWeightG ?? 0, rules);

  // 요율/가정 조립
  const { tables, categoryVerified } = await buildCoupangTables(
    product.categoryId,
    size.sizeType,
    asOf
  );
  const assumptions = await resolveAssumptions(pid, category?.major ?? null);
  const promoCtx = await resolvePromoContext(
    asOf,
    b.saverEnabled,
    b.promoApplied,
    b.cumulativeRevenue
  );

  // 착지원가: override > 최신 로트 > null(0)
  const landedFromLot = await resolveLandedCost(pid);
  const landedCostPerUnit = b.landedCostPerUnit ?? landedFromLot ?? 0;

  const scenarios = calcScenarios({
    finalPrice: b.finalPrice,
    landedCostPerUnit,
    sizeType: size.sizeType,
    asOfDate: asOf,
    returnResalable: product.returnResalable,
    disposalCost: b.disposalCost,
    tables,
    promoCtx,
    assumptions,
  });

  const promoCompare = promoCtx.promo
    ? comparePromoVsPost({
        finalPrice: b.finalPrice,
        landedCostPerUnit,
        sizeType: size.sizeType,
        asOfDate: asOf,
        returnResalable: product.returnResalable,
        disposalCost: b.disposalCost,
        assumption: assumptions.base,
        tables,
        promoCtx,
      })
    : null;

  return NextResponse.json({
    asOf,
    size,
    landedCostPerUnit,
    landedSource: b.landedCostPerUnit != null ? "override" : landedFromLot != null ? "lot" : "none",
    scenarios,
    promoCompare,
    flags: {
      categoryVerified,
      logisticsConfigured: tables.logistics !== null,
      sizeRulesConfigured: size.rulesConfigured,
      returnResalable: product.returnResalable,
    },
  });
}
