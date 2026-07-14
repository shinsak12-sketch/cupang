"use client";

import { use, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { won, pct } from "@/lib/utils";

const FREE_SHIP = 19800;

type AnalyzeResp = {
  asOf: string;
  size: {
    sizeType: string | null;
    rulesConfigured: boolean;
    dimSumMm: number;
    billableWeightG: number;
    isRgEligible: boolean;
    boundaryWarnings: string[];
  };
  landedCostPerUnit: number;
  landedSource: string;
  scenarios: {
    verdict: "GO" | "CAUTION" | "NO-GO";
    verdictReason: string;
    optimistic: Outcome;
    base: Outcome;
    pessimistic: Outcome;
  };
  promoCompare: {
    duringPromo: { netProfit: number; marginRate: number };
    afterPromo: { netProfit: number; marginRate: number };
    cliffAmount: number;
    cliffMarginPoints: number;
    daysRemaining: number | null;
    revenueCapRemaining: number | null;
  } | null;
  flags: {
    categoryVerified: boolean;
    logisticsConfigured: boolean;
    sizeRulesConfigured: boolean;
    returnResalable: boolean;
  };
};
type Outcome = {
  netProfit: number;
  marginRate: number;
  roi: number;
  returnLoss: number;
  breakevenQty: number;
};

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const { data: detail } = useQuery({
    queryKey: ["product", id],
    queryFn: async () => (await fetch(`/api/products/${id}`)).json(),
  });

  const [price, setPrice] = useState(19800);
  const [landed, setLanded] = useState("");
  const [saver, setSaver] = useState(false);
  const [promo, setPromo] = useState(true);

  const body = useMemo(
    () => ({
      finalPrice: price,
      landedCostPerUnit: landed ? Number(landed) : null,
      saverEnabled: saver,
      promoApplied: promo,
    }),
    [price, landed, saver, promo]
  );

  const { data: a, isFetching, error } = useQuery({
    queryKey: ["analyze", id, body],
    queryFn: async (): Promise<AnalyzeResp> => {
      const r = await fetch(`/api/products/${id}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    placeholderData: (p) => p,
  });

  const product = detail?.product;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/products" className="text-sm text-muted-foreground hover:underline">
            ← SKU 목록
          </Link>
          <h1 className="text-2xl font-bold">{product?.name ?? "…"}</h1>
        </div>
        {a && <VerdictBadge verdict={a.scenarios.verdict} reason={a.scenarios.verdictReason} />}
      </div>

      {/* 경고 배지 */}
      {a && (
        <div className="flex flex-wrap gap-2">
          {!a.flags.sizeRulesConfigured && (
            <Badge variant="warn">사이즈 규칙 미설정 — 윙 확인 필요</Badge>
          )}
          {!a.flags.logisticsConfigured && <Badge variant="warn">물류비 미설정(0 처리)</Badge>}
          {!a.flags.categoryVerified && <Badge variant="warn">카테고리 요율 미검증</Badge>}
          {!a.flags.returnResalable && <Badge variant="nogo">반품=원가 전손</Badge>}
          {a.landedSource === "none" && <Badge variant="warn">착지원가 미입력(0) — 아래에서 입력</Badge>}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 컨트롤 */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">가격 시뮬레이터</CardTitle>
            <CardDescription>슬라이더를 움직이면 실시간 재계산</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm">최종 결제가</label>
                <span className="tabular-nums font-semibold">{won(price)}</span>
              </div>
              <input
                type="range"
                min={5000}
                max={60000}
                step={100}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="w-full"
              />
              {/* 🔴 19,800 무료배송 경계 */}
              <div className="mt-1 flex items-center gap-2 text-xs">
                {price >= FREE_SHIP ? (
                  <Badge variant="go">무료배송 ✓ ({won(FREE_SHIP)}↑)</Badge>
                ) : (
                  <Badge variant="nogo">무료배송 경계 미달 ({won(FREE_SHIP - price)} 부족)</Badge>
                )}
              </div>
            </div>

            <div>
              <label className="text-sm">착지원가/개 (미입력시 로트값/0)</label>
              <Input
                value={landed}
                onChange={(e) => setLanded(e.target.value)}
                placeholder={a ? String(a.landedCostPerUnit) : "0"}
                inputMode="numeric"
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={promo} onChange={(e) => setPromo(e.target.checked)} />
              신규 90일 프로모션 적용
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={saver} onChange={(e) => setSaver(e.target.checked)} />
              로켓그로스 세이버
            </label>

            {a && (
              <div className="rounded-md border p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">사이즈</span>
                  <span className="font-semibold">
                    {a.size.sizeType ?? "미설정"} · {a.size.dimSumMm}mm ·{" "}
                    {Math.round(a.size.billableWeightG)}g
                  </span>
                </div>
                {a.size.boundaryWarnings.map((w, i) => (
                  <p key={i} className="mt-1 text-xs text-warn">
                    ⚠ {w}
                  </p>
                ))}
                {!a.size.isRgEligible && (
                  <p className="mt-1 text-xs text-destructive">🔴 로켓그로스 등록 한계 초과</p>
                )}
              </div>
            )}
            {isFetching && <p className="text-xs text-muted-foreground">계산 중…</p>}
            {error && <p className="text-xs text-destructive">{String(error)}</p>}
          </CardContent>
        </Card>

        {/* 3시나리오 */}
        <div className="space-y-4 lg:col-span-2">
          {a && (
            <div className="grid gap-3 sm:grid-cols-3">
              <ScenarioCard title="낙관" tone="go" o={a.scenarios.optimistic} price={price} />
              <ScenarioCard title="기준" tone="default" o={a.scenarios.base} price={price} />
              <ScenarioCard title="비관" tone="nogo" o={a.scenarios.pessimistic} price={price} />
            </div>
          )}

          {/* 프로모션 전후 절벽 */}
          {a?.promoCompare && (
            <Card className="border-warn">
              <CardHeader>
                <CardTitle className="text-base">🔴 프로모션 절벽 (중 vs 종료 후)</CardTitle>
                <CardDescription>
                  {a.promoCompare.daysRemaining != null
                    ? `D-${a.promoCompare.daysRemaining}`
                    : "내 시작일(my_start_date) 미입력"}
                  {a.promoCompare.revenueCapRemaining != null &&
                    ` · 2억 캡까지 ${won(a.promoCompare.revenueCapRemaining)}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">프로모션 중</p>
                  <p className="text-lg font-semibold text-emerald-600">
                    {pct(a.promoCompare.duringPromo.marginRate)}
                  </p>
                  <p className="tabular-nums">{won(a.promoCompare.duringPromo.netProfit)}/개</p>
                </div>
                <div>
                  <p className="text-muted-foreground">종료 후</p>
                  <p className="text-lg font-semibold text-red-600">
                    {pct(a.promoCompare.afterPromo.marginRate)}
                  </p>
                  <p className="tabular-nums">{won(a.promoCompare.afterPromo.netProfit)}/개</p>
                </div>
                <div className="col-span-2 rounded bg-warn/10 p-2 text-warn">
                  종료시 개당 <b>{won(a.promoCompare.cliffAmount)}</b> 증발 · 마진{" "}
                  <b>{a.promoCompare.cliffMarginPoints}%p</b> 하락
                </div>
              </CardContent>
            </Card>
          )}

          <SetOptimizer id={id} defaultLanded={a?.landedCostPerUnit ?? 0} promo={promo} saver={saver} />
        </div>
      </div>
    </div>
  );
}

function VerdictBadge({ verdict, reason }: { verdict: "GO" | "CAUTION" | "NO-GO"; reason: string }) {
  const variant = verdict === "GO" ? "go" : verdict === "CAUTION" ? "caution" : "nogo";
  return (
    <div className="text-right">
      <Badge variant={variant} className="text-base">
        {verdict}
      </Badge>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">{reason}</p>
    </div>
  );
}

function ScenarioCard({
  title,
  tone,
  o,
  price,
}: {
  title: string;
  tone: "go" | "default" | "nogo";
  o: Outcome;
  price: number;
}) {
  const color = o.netProfit < 0 ? "text-red-600" : "text-foreground";
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription>{title}</CardDescription>
          <Badge variant={tone === "default" ? "secondary" : tone}>{pct(o.marginRate)}</Badge>
        </div>
        <CardTitle className={`text-2xl tabular-nums ${color}`}>{won(o.netProfit)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-xs text-muted-foreground">
        <Row label="ROI" value={pct(o.roi)} />
        <Row label="반품손실/개" value={won(o.returnLoss)} />
        <Row label="매출대비" value={pct((o.netProfit / (price / 1.1)) * 100)} />
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="tabular-nums text-foreground">{value}</span>
    </div>
  );
}

type SetOptRow = {
  setQty: number;
  sizeType: string | null;
  suggestedPrice: number;
  freeShippingOk: boolean;
  logisticsCostPerUnit: number;
  marginRate: number;
  netProfitPerUnit: number;
};
type SetOptData = {
  result: { recommended: number | null; tradeoffNote: string; results: SetOptRow[] };
};

function SetOptimizer({
  id,
  defaultLanded,
  promo,
  saver,
}: {
  id: string;
  defaultLanded: number;
  promo: boolean;
  saver: boolean;
}) {
  const [landed, setLanded] = useState("");
  const [target, setTarget] = useState("20");
  const [qtys, setQtys] = useState("1,3,5,10");
  const [data, setData] = useState<SetOptData | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/products/${id}/setopt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          landedCostPerUnit: landed ? Number(landed) : defaultLanded,
          candidateQtys: qtys.split(",").map((s) => Number(s.trim())).filter(Boolean),
          targetMarginRate: Number(target) || 20,
          promoApplied: promo,
          saverEnabled: saver,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(j.error ?? j));
      setData(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">세트 최적화기</CardTitle>
        <CardDescription>족수 ↑ → 객단가 ↑·개당물류비 ↓ 이지만 사이즈 등급 ↑</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            낱개원가
            <Input value={landed} onChange={(e) => setLanded(e.target.value)} placeholder={String(defaultLanded)} className="h-8 w-24" />
          </label>
          <label className="text-sm">
            목표마진%
            <Input value={target} onChange={(e) => setTarget(e.target.value)} className="h-8 w-20" />
          </label>
          <label className="text-sm">
            후보 족수
            <Input value={qtys} onChange={(e) => setQtys(e.target.value)} className="h-8 w-28" />
          </label>
          <Button size="sm" onClick={run} disabled={busy}>
            최적화
          </Button>
        </div>
        {err && <p className="text-xs text-destructive">{err}</p>}
        {data?.result && (
          <>
            <p className="text-sm">
              추천: <b>{data.result.recommended}족</b> — {data.result.tradeoffNote}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="p-1 text-left">족수</th>
                    <th className="p-1">사이즈</th>
                    <th className="p-1 text-right">권장가</th>
                    <th className="p-1">무료배송</th>
                    <th className="p-1 text-right">개당물류비</th>
                    <th className="p-1 text-right">마진</th>
                    <th className="p-1 text-right">개당순익</th>
                  </tr>
                </thead>
                <tbody>
                  {data.result.results.map((r: SetOptRow) => (
                    <tr
                      key={r.setQty}
                      className={r.setQty === data.result.recommended ? "bg-accent" : ""}
                    >
                      <td className="p-1">{r.setQty}</td>
                      <td className="p-1 text-center">{r.sizeType ?? "-"}</td>
                      <td className="p-1 text-right tabular-nums">{won(r.suggestedPrice)}</td>
                      <td className="p-1 text-center">{r.freeShippingOk ? "✓" : "✗"}</td>
                      <td className="p-1 text-right tabular-nums">{won(r.logisticsCostPerUnit)}</td>
                      <td className="p-1 text-right tabular-nums">{pct(r.marginRate)}</td>
                      <td className="p-1 text-right tabular-nums">{won(r.netProfitPerUnit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
