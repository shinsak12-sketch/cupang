import { NextResponse } from "next/server";
import { count, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 대시보드 통계 — 🔴 모든 질의를 Promise.all 로 병렬(Neon 왕복 1회분)로 처리해 빠르게.
 */
export async function GET() {
  const ym = new Date().toISOString().slice(0, 7); // YYYY-MM

  const [statusRows, catCount, promoRow, plans, sales] = await Promise.all([
    db.select({ status: schema.product.status, n: count() }).from(schema.product).groupBy(schema.product.status),
    db.select({ n: count() }).from(schema.feeCategory),
    db.query.promotion.findFirst({
      where: (t, { eq: e, and }) => and(e(t.isActive, true), e(t.promoKey, "rg_zerocost_new")),
    }),
    db.select().from(schema.pricePlan).where(eq(schema.pricePlan.isActive, true)),
    db.select().from(schema.salesActual),
  ]);

  const statusCount = (s: string) => statusRows.find((r) => r.status === s)?.n ?? 0;

  // 상품별 개당 마진 맵 (스냅샷 result.marginAfterAd)
  const marginMap = new Map<number, number>();
  for (const p of plans) {
    const snap = p.calcSnapshot as { result?: { marginAfterAd?: number } } | null;
    if (p.productId != null) marginMap.set(p.productId, snap?.result?.marginAfterAd ?? 0);
  }

  let thisMonthQty = 0;
  let thisMonthMargin = 0;
  let totalQty = 0;
  let totalMargin = 0;
  for (const s of sales) {
    const qty = s.soldQty ?? 0;
    const unit = marginMap.get(s.productId ?? -1) ?? 0;
    totalQty += qty;
    totalMargin += qty * unit;
    if (s.ym === ym) {
      thisMonthQty += qty;
      thisMonthMargin += qty * unit;
    }
  }

  let promo: { name: string; myStartDate: string | null; daysRemaining: number | null } | null = null;
  if (promoRow) {
    let daysRemaining: number | null = null;
    if (promoRow.myStartDate && promoRow.capDays !== null) {
      const elapsed = Math.floor((Date.now() - Date.parse(promoRow.myStartDate + "T00:00:00Z")) / 86_400_000);
      daysRemaining = promoRow.capDays - elapsed;
    }
    promo = { name: promoRow.name, myStartDate: promoRow.myStartDate, daysRemaining };
  }

  return NextResponse.json({
    ym,
    candidate: statusCount("검토중"),
    selling: statusCount("판매중"),
    discarded: statusCount("중단"),
    categories: catCount[0]?.n ?? 0,
    promo,
    sales: { thisMonthQty, thisMonthMargin: Math.round(thisMonthMargin), totalQty, totalMargin: Math.round(totalMargin) },
  });
}
