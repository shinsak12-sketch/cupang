import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { analyzeProduct } from "@/lib/analyze";
import { calcCashflow } from "@/lib/calc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PRICE = 19800;

export interface CompareRow {
  id: number;
  name: string;
  sizeType: string | null;
  price: number;
  priceSource: "price_plan" | "default";
  marginRate: number;
  netProfit: number;
  roi: number;
  breakevenQty: number;
  verdict: "GO" | "CAUTION" | "NO-GO";
  recoveryDays: number | null;
  maxCashLocked: number | null;
  annualizedRoi: number | null; // 🔴 ROI × 회전율 = 연환산 자본수익률
}

/**
 * SKU 비교 랭킹 (스펙 §5-4). 🔴 ROI × 회전율 = 연환산 자본수익률이 진짜 순위.
 * 회전율은 로트 캐시플로우(회수일)에서 산출 — 로트 없으면 annualizedRoi=null.
 * 프로모션은 durable 판단 위해 기본 off(종료 후 경제성)로 계산.
 */
export async function GET(req: NextRequest) {
  const asOf = req.nextUrl.searchParams.get("asOf") ?? undefined;
  const products = await db.select().from(schema.product);
  const rows: CompareRow[] = [];

  for (const p of products) {
    const plan = await db.query.pricePlan.findFirst({
      where: (t, { eq: e, and }) => and(e(t.productId, p.id), e(t.isActive, true)),
    });
    const price = plan?.finalPrice ? Number(plan.finalPrice) : DEFAULT_PRICE;

    const a = await analyzeProduct(p.id, { finalPrice: price, promoApplied: false, asOfDate: asOf });
    if (!a) continue;
    const base = a.scenarios.base;

    // 회전율: 최신 로트 캐시플로우
    let recoveryDays: number | null = null;
    let maxCashLocked: number | null = null;
    let annualizedRoi: number | null = null;
    const lot = await db.query.lot.findFirst({
      where: (t, { eq: e }) => e(t.productId, p.id),
      orderBy: (t) => [desc(t.createdAt)],
    });
    if (lot && lot.paidDate && lot.landedCostPerUnit) {
      const settlementPerUnit = price - base.fees.total;
      const cf = calcCashflow({
        investmentKrw: Number(lot.landedCostPerUnit) * lot.orderQty,
        orderQty: lot.orderQty,
        paidDate: lot.paidDate,
        inboundDate: lot.inboundDate,
        monthlySalesQty: 80, // 기준 시나리오 월판매 가정 (로트별 실측은 Phase 2)
        settlementPerUnit,
      });
      recoveryDays = cf.recoveryDays;
      maxCashLocked = cf.maxCashLocked;
      if (recoveryDays && recoveryDays > 0) {
        annualizedRoi = Math.round(base.roi * (365 / recoveryDays) * 10) / 10;
      }
    }

    rows.push({
      id: p.id,
      name: p.name,
      sizeType: a.size.sizeType,
      price,
      priceSource: plan?.finalPrice ? "price_plan" : "default",
      marginRate: base.marginRate,
      netProfit: base.netProfit,
      roi: base.roi,
      breakevenQty: base.breakevenQty,
      verdict: a.scenarios.verdict,
      recoveryDays,
      maxCashLocked,
      annualizedRoi,
    });
  }

  // 기본 정렬: 연환산 ROI (없으면 뒤로) → ROI
  rows.sort((x, y) => {
    const ax = x.annualizedRoi ?? -Infinity;
    const ay = y.annualizedRoi ?? -Infinity;
    if (ay !== ax) return ay - ax;
    return y.roi - x.roi;
  });

  return NextResponse.json({ rows });
}
