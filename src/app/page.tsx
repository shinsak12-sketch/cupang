import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calculator, DatabaseZap, CircleDot } from "lucide-react";

export const dynamic = "force-dynamic";

type Summary = {
  ok: boolean;
  error?: string;
  categories: number;
  candidate: number;
  selling: number;
  discarded: number;
  promo: { name: string; myStartDate: string | null; daysRemaining: number | null } | null;
};

async function loadSummary(): Promise<Summary> {
  try {
    const { db, schema } = await import("@/db");
    const { eq, count } = await import("drizzle-orm");
    const [cat] = await db.select({ n: count() }).from(schema.feeCategory);
    const cnt = async (status: "검토중" | "판매중" | "중단") => {
      const [r] = await db
        .select({ n: count() })
        .from(schema.product)
        .where(eq(schema.product.status, status));
      return r.n;
    };
    const candidate = await cnt("검토중");
    const selling = await cnt("판매중");
    const discarded = await cnt("중단");

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

    return { ok: true, categories: cat.n, candidate, selling, discarded, promo };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      categories: 0,
      candidate: 0,
      selling: 0,
      discarded: 0,
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
        <p className="text-sm font-medium opacity-90">쿠팡 로켓그로스 마진계산기</p>
        <h1 className="mt-1 text-2xl font-extrabold leading-snug">
          이 상품, 팔면
          <br />얼마 남을까?
        </h1>
        <p className="mt-2 max-w-sm text-sm opacity-90">
          <b>원가부터</b> 입력하면 수수료·입출고비·부가세까지 빼고 최종 마진을 계산합니다.
        </p>
        <div className="mt-4">
          <Button asChild variant="secondary" size="lg">
            <Link href="/calc">
              <Calculator /> 마진 계산하기
            </Link>
          </Button>
        </div>
      </section>

      {/* 셋업 필요 */}
      {needsSetup && (
        <Card className="border-2 border-primary/30 bg-accent">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <DatabaseZap className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">먼저 준비하기 (1분)</CardTitle>
            </div>
            <CardDescription>
              {s.ok
                ? "기초 데이터(카테고리 요율·수수료)를 채우면 계산이 더 정확해져요."
                : "DB가 아직 연결/셋업되지 않았어요. 버튼으로 스키마 생성 + 데이터 채우기를 한 번에."}
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

      {/* 후보/판매중/폐기 요약 */}
      {s.ok && (
        <Link href="/products" className="block">
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="후보" value={s.candidate} tone="primary" />
            <StatTile label="판매중" value={s.selling} tone="go" />
            <StatTile label="폐기" value={s.discarded} tone="muted" />
          </div>
        </Link>
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
                {s.promo.myStartDate ? "종료 후 물류비 0원 혜택 소멸 — 마진 절벽 주의" : "시작일을 넣으면 남은 날짜 계산"}
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

      {/* 사용법 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">이렇게 쓰세요</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Step n={1} title="원가부터 입력" desc="제품 원가 → 사입비(대행/배송) → 기타비용" />
          <Step n={2} title="판매 정보 입력" desc="판매가 · 카테고리(수수료) · 입출고비 · 광고비" />
          <Step n={3} title="저장 → 후보 등록" desc="마진 확인 후 저장, 목록에서 판매등록/폐기" />
        </CardContent>
      </Card>
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
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "primary" | "go" | "muted";
}) {
  const color =
    tone === "primary" ? "text-primary" : tone === "go" ? "text-emerald-600" : "text-muted-foreground";
  return (
    <Card className="transition-all active:scale-[0.98]">
      <CardContent className="p-4 text-center">
        <p className={`text-3xl font-extrabold tabular-nums ${color}`}>{value}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
