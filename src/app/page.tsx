import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

type Summary = {
  ok: boolean;
  error?: string;
  categories: number;
  unverifiedCategories: number;
  logistics: number;
  sizeRules: number;
  products: number;
  estimateAssumptions: number;
  promo: { name: string; myStartDate: string | null; daysRemaining: number | null } | null;
};

async function loadSummary(): Promise<Summary> {
  try {
    const { db, schema } = await import("@/db");
    const { eq, count } = await import("drizzle-orm");
    const [cat] = await db.select({ n: count() }).from(schema.feeCategory);
    const [unv] = await db
      .select({ n: count() })
      .from(schema.feeCategory)
      .where(eq(schema.feeCategory.isVerified, false));
    const [log] = await db.select({ n: count() }).from(schema.feeLogistics);
    const [sr] = await db.select({ n: count() }).from(schema.feeSizeRule);
    const [prod] = await db.select({ n: count() }).from(schema.product);
    const [est] = await db
      .select({ n: count() })
      .from(schema.assumption)
      .where(eq(schema.assumption.isEstimate, true));

    // 🔴 프로모션 D-day (my_start_date + cap_days)
    const promoRow = await db.query.promotion.findFirst({
      where: (t, { eq: e, and }) => and(e(t.isActive, true), e(t.promoKey, "rg_zerocost_new")),
    });
    let promo: Summary["promo"] = null;
    if (promoRow) {
      let daysRemaining: number | null = null;
      if (promoRow.myStartDate && promoRow.capDays !== null) {
        const start = Date.parse(promoRow.myStartDate + "T00:00:00Z");
        const elapsed = Math.floor((Date.now() - start) / 86_400_000);
        daysRemaining = promoRow.capDays - elapsed;
      }
      promo = { name: promoRow.name, myStartDate: promoRow.myStartDate, daysRemaining };
    }

    return {
      ok: true,
      categories: cat.n,
      unverifiedCategories: unv.n,
      logistics: log.n,
      sizeRules: sr.n,
      products: prod.n,
      estimateAssumptions: est.n,
      promo,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      categories: 0,
      unverifiedCategories: 0,
      logistics: 0,
      sizeRules: 0,
      products: 0,
      estimateAssumptions: 0,
      promo: null,
    };
  }
}

export default async function DashboardPage() {
  const s = await loadSummary();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">대시보드</h1>
        <p className="text-sm text-muted-foreground">
          Phase 1-A 기반 구축 완료 — 수수료 테이블 시딩 및 CRUD가 준비되었습니다.
        </p>
      </div>

      {!s.ok && (
        <Card className="border-warn">
          <CardHeader>
            <CardTitle className="text-warn">DB 연결/셋업 필요</CardTitle>
            <CardDescription>
              모바일이면 <Link href="/settings/setup" className="font-semibold underline">셋업 페이지</Link>
              에서 버튼 한 번으로 스키마+시딩. (CLI는 <code>npm run db:push &amp;&amp; npm run db:seed</code>)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">{s.error}</pre>
          </CardContent>
        </Card>
      )}

      {/* 🔴 프로모션 D-day 알림 */}
      {s.promo && (
        <Card className="border-warn">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{s.promo.name}</CardTitle>
              {s.promo.daysRemaining !== null ? (
                <Badge variant={s.promo.daysRemaining <= 14 ? "nogo" : "warn"}>
                  D-{s.promo.daysRemaining}
                </Badge>
              ) : (
                <Badge variant="warn">시작일 미입력</Badge>
              )}
            </div>
            <CardDescription>
              {s.promo.myStartDate
                ? `내 시작일 ${s.promo.myStartDate} 기준 · 종료시 물류비 0원 혜택 소멸 (마진 절벽)`
                : "/settings/promotions 에서 my_start_date 를 입력하면 D-day가 계산됩니다."}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="카테고리 요율" value={s.categories} href="/settings/fees">
          {s.unverifiedCategories > 0 && (
            <Badge variant="warn">미검증 {s.unverifiedCategories}</Badge>
          )}
        </StatCard>
        <StatCard title="물류비 규칙" value={s.logistics} href="/settings/fees">
          <Badge variant="warn">하한값(미검증)</Badge>
        </StatCard>
        <StatCard title="사이즈 판정 규칙" value={s.sizeRules} href="/settings/fees">
          {s.sizeRules === 0 && <Badge variant="warn">윙 확인 후 입력 필요</Badge>}
        </StatCard>
        <StatCard title="등록 SKU" value={s.products} href="/products" />
        <StatCard title="추정 가정값" value={s.estimateAssumptions} href="/settings/assumptions">
          <Badge variant="warn">is_estimate</Badge>
        </StatCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>다음 단계</CardTitle>
          <CardDescription>구현 로드맵 (CLAUDE_CODE_PROMPT §8)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>✅ <b>Phase 1-A</b> — Next.js + Drizzle + Neon / 스키마 / 시딩 / Basic Auth / 수수료 CRUD + 업로드(diff)</p>
          <p className="text-muted-foreground">⬜ Phase 1-B — 계산 엔진 <code>/lib/calc/</code> + Vitest (양말 테스트케이스)</p>
          <p className="text-muted-foreground">⬜ Phase 1-C — SKU/로트 · URL 파싱 · 북마클릿 · 사이즈 판정기 · 착지원가</p>
          <p className="text-muted-foreground">⬜ Phase 1-D — 3시나리오 판정 · 시뮬레이터 · 세트 최적화 · 프로모션 전후 · 캐시플로우</p>
          <p className="text-muted-foreground">⬜ Phase 1-E — 비교 랭킹 · 알림</p>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  value,
  href,
  children,
}: {
  title: string;
  value: number;
  href: string;
  children?: React.ReactNode;
}) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:bg-accent">
        <CardHeader className="pb-2">
          <CardDescription>{title}</CardDescription>
          <CardTitle className="text-3xl">{value.toLocaleString("ko-KR")}</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">{children}</CardContent>
      </Card>
    </Link>
  );
}
