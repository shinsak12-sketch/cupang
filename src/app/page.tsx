import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, PackagePlus, DatabaseZap, CircleDot } from "lucide-react";

export const dynamic = "force-dynamic";

type Summary = {
  ok: boolean;
  error?: string;
  categories: number;
  unverifiedCategories: number;
  sizeRules: number;
  products: number;
  socksId: number | null;
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
    const [sr] = await db.select({ n: count() }).from(schema.feeSizeRule);
    const [prod] = await db.select({ n: count() }).from(schema.product);
    const socks = await db.query.product.findFirst({
      where: (t, { eq: e }) => e(t.name, "양말 (데모 프로파일)"),
    });

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
      sizeRules: sr.n,
      products: prod.n,
      socksId: socks?.id ?? null,
      promo,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      categories: 0,
      unverifiedCategories: 0,
      sizeRules: 0,
      products: 0,
      socksId: null,
      promo: null,
    };
  }
}

export default async function DashboardPage() {
  const s = await loadSummary();
  const needsSetup = !s.ok || s.categories === 0;

  return (
    <div className="space-y-5">
      {/* 히어로 */}
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-violet-600 p-6 text-primary-foreground shadow-pop">
        <p className="text-sm font-medium opacity-90">쿠팡 로켓그로스 수익계산기</p>
        <h1 className="mt-1 text-2xl font-extrabold leading-snug">
          이 상품, 팔면
          <br />얼마 남을까?
        </h1>
        <p className="mt-2 max-w-sm text-sm opacity-90">
          낙관·기준·비관 3가지로 계산해서 <b>팔면 안 되는 상품을 걸러줍니다.</b>
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="lg">
            <Link href="/products/new">
              <PackagePlus /> 상품 등록하기
            </Link>
          </Button>
          {s.socksId && (
            <Button
              asChild
              size="lg"
              className="bg-white/15 text-white shadow-none hover:bg-white/25"
            >
              <Link href={`/products/${s.socksId}`}>
                양말 예시 보기 <ArrowRight />
              </Link>
            </Button>
          )}
        </div>
      </section>

      {/* 셋업 필요 안내 */}
      {needsSetup && (
        <Card className="border-2 border-primary/30 bg-accent">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <DatabaseZap className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">먼저 준비하기 (1분)</CardTitle>
            </div>
            <CardDescription>
              {s.ok
                ? "데이터가 비어 있어요. 아래 버튼으로 기초 데이터(수수료·양말 예시)를 채우세요."
                : "DB가 아직 연결/셋업되지 않았어요. 아래 버튼으로 스키마 생성 + 데이터 채우기를 한 번에."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/settings/setup">
                <DatabaseZap /> DB 셋업 실행하기
              </Link>
            </Button>
            {!s.ok && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-muted-foreground">오류 상세</summary>
                <pre className="mt-1 overflow-x-auto rounded-lg bg-muted p-2 text-xs">{s.error}</pre>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      {/* 🔴 프로모션 D-day */}
      {s.promo && (
        <Card className="border-warn/40">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-warn/15 text-warn-foreground">
              <CircleDot className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold">{s.promo.name}</p>
              <p className="text-sm text-muted-foreground">
                {s.promo.myStartDate
                  ? "종료 후 물류비 0원 혜택 소멸 — 마진 절벽 주의"
                  : "시작일을 넣으면 남은 날짜가 계산돼요"}
              </p>
            </div>
            {s.promo.daysRemaining !== null ? (
              <Badge variant={s.promo.daysRemaining <= 14 ? "nogo" : "warn"} className="text-sm">
                D-{s.promo.daysRemaining}
              </Badge>
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link href="/settings/promotions">입력</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* 사용법 3단계 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">이렇게 쓰세요</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Step n={1} title="상품 등록" desc="1688 URL 붙여넣기 + 포장 크기/무게 입력" />
          <Step n={2} title="가격 슬라이더 조정" desc="가격을 밀면 사이즈·수수료·마진이 실시간 계산" />
          <Step n={3} title="GO / NO-GO 확인" desc="비관 시나리오가 적자면 NO-GO — 팔면 안 되는 상품" />
        </CardContent>
      </Card>

      {/* 상태 요약 */}
      {s.ok && (
        <div className="grid grid-cols-2 gap-3">
          <StatTile title="등록 상품" value={s.products} href="/products" />
          <StatTile title="카테고리 요율" value={s.categories} href="/settings/fees" />
          <StatTile
            title="사이즈 규칙"
            value={s.sizeRules}
            href="/settings/fees"
            warn={s.sizeRules === 0 ? "미설정" : undefined}
          />
          <StatTile
            title="미검증 요율"
            value={s.unverifiedCategories}
            href="/settings/fees"
            warn={s.unverifiedCategories > 0 ? "확인 필요" : undefined}
          />
        </div>
      )}
    </div>
  );
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
        {n}
      </span>
      <div>
        <p className="font-semibold leading-tight">{title}</p>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}

function StatTile({
  title,
  value,
  href,
  warn,
}: {
  title: string;
  value: number;
  href: string;
  warn?: string;
}) {
  return (
    <Link href={href}>
      <Card className="h-full transition-all active:scale-[0.98]">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums">{value.toLocaleString("ko-KR")}</p>
          {warn && (
            <Badge variant="warn" className="mt-2">
              {warn}
            </Badge>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
