"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, Save, Package, Percent, Megaphone, RotateCcw } from "lucide-react";
import { usePersistentState, clearPersisted } from "@/lib/persist";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { won, pct } from "@/lib/utils";
import { calcSimpleMargin } from "@/lib/calc/simple";

type Category = {
  id: number;
  major: string;
  middle: string | null;
  minor: string | null;
  commissionRate: string;
  isDefault: boolean;
};
type Logistics = { sizeType: string; inboundFee: number; shippingFee: number };

const n = (v: string) => {
  const x = Number(v.replace(/,/g, ""));
  return Number.isFinite(x) ? x : 0;
};

export default function CalcPage() {
  const router = useRouter();
  const { data: cats = [] } = useQuery({
    queryKey: ["fees", "category"],
    queryFn: async () => {
      const r = await fetch("/api/fees/category");
      return r.ok ? ((await r.json()).rows as Category[]) : [];
    },
  });
  const { data: logistics = [] } = useQuery({
    queryKey: ["fees", "logistics"],
    queryFn: async () => {
      const r = await fetch("/api/fees/logistics");
      return r.ok ? ((await r.json()).rows as Logistics[]) : [];
    },
  });

  // 상품 (화면 전환에도 유지 — 엑셀 시트처럼)
  const [name, setName] = usePersistentState("calc.name", "");
  const [sourceUrl, setSourceUrl] = usePersistentState("calc.sourceUrl", "");
  const [major, setMajor] = usePersistentState("calc.major", "");
  const [middle, setMiddle] = usePersistentState("calc.middle", "");

  // 사입
  const [sourcing, setSourcing] = usePersistentState<"overseas" | "domestic">("calc.sourcing", "overseas");
  // 해외 (중국): (원가위안 + 내륙운송비위안) × (환율 + 가산)
  const [costCny, setCostCny] = usePersistentState("calc.costCny", "");
  const [cnInland, setCnInland] = usePersistentState("calc.cnInland", "");
  const [fx, setFx] = usePersistentState("calc.fx", "190");
  const [fxEdited, setFxEdited] = usePersistentState("calc.fxEdited", false);
  const [surcharge, setSurcharge] = usePersistentState("calc.surcharge", "80");

  // 환율 자동 (CNY→KRW). 사용자가 직접 고치기 전까지만 자동 반영.
  const { data: fxData } = useQuery({
    queryKey: ["fx", "latest"],
    queryFn: async () => {
      const r = await fetch("/api/fx/latest");
      return r.ok
        ? ((await r.json()) as { rate: number | null; kind: string | null; date: string | null })
        : null;
    },
    staleTime: 3600_000,
  });
  useEffect(() => {
    if (fxData?.rate && !fxEdited) setFx(String(fxData.rate));
  }, [fxData, fxEdited]);
  // 국내
  const [costKrw, setCostKrw] = usePersistentState("calc.costKrw", "");
  const [domShip, setDomShip] = usePersistentState("calc.domShip", "");
  const [shipMode, setShipMode] = usePersistentState<"per" | "once">("calc.shipMode", "per");
  const [qty, setQty] = usePersistentState("calc.qty", "1");
  const [others, setOthers] = usePersistentState<{ label: string; amount: string }[]>("calc.others", []);

  // 판매
  const [salePrice, setSalePrice] = usePersistentState("calc.salePrice", "");
  const [commission, setCommission] = usePersistentState("calc.commission", "10.8");
  const [sizeType, setSizeType] = usePersistentState("calc.sizeType", "");
  const [inboundShip, setInboundShip] = usePersistentState("calc.inboundShip", "");
  const [adCost, setAdCost] = usePersistentState("calc.adCost", "");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [editingId, setEditingId] = usePersistentState<number | null>("calc.editingId", null);

  function resetForm() {
    clearPersisted("calc.");
    setName("");
    setSourceUrl("");
    setMajor("");
    setMiddle("");
    setSourcing("overseas");
    setCostCny("");
    setCnInland("");
    setFxEdited(false);
    setFx(fxData?.rate ? String(fxData.rate) : "190");
    setSurcharge("80");
    setCostKrw("");
    setDomShip("");
    setShipMode("per");
    setQty("1");
    setOthers([]);
    setSalePrice("");
    setCommission("10.8");
    setSizeType("");
    setInboundShip("");
    setAdCost("");
    setEditingId(null);
    setMsg(null);
  }

  // ?load=<id> → 저장된 계산 불러와 수정
  useEffect(() => {
    const load = new URLSearchParams(window.location.search).get("load");
    if (!load) return;
    (async () => {
      const r = await fetch(`/api/products/${load}`);
      if (!r.ok) return;
      const j = await r.json();
      const inp = j.snapshot?.inputs;
      if (!inp) return;
      const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
      setEditingId(Number(load));
      setName(j.product?.name ?? "");
      setSourceUrl(j.product?.sourceUrl ?? "");
      setMajor(inp.major ?? "");
      setMiddle(inp.middle ?? "");
      setSourcing(inp.sourcing === "domestic" ? "domestic" : "overseas");
      setCostCny(s(inp.costCny));
      setCnInland(s(inp.cnInland));
      setFx(s(inp.fx));
      setFxEdited(true);
      setSurcharge(s(inp.surcharge));
      setCostKrw(s(inp.costKrw));
      setDomShip(s(inp.domShip));
      setShipMode(inp.shipMode === "once" ? "once" : "per");
      setQty(s(inp.qty));
      setOthers(Array.isArray(inp.others) ? inp.others : []);
      setSalePrice(s(inp.salePrice));
      setCommission(s(inp.commission));
      setSizeType(inp.sizeType ?? "");
      setInboundShip(s(inp.inboundShip));
      setAdCost(s(inp.adCost));
    })();
  }, []);

  // ?name= / ?link= → 상품찾기에서 넘어올 때 프리필 (기존 입력이 있으면 유지)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const nm = p.get("name");
    const link = p.get("link");
    if (nm) setName((prev) => prev || nm);
    if (link) setSourceUrl((prev) => prev || link);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 카테고리 캐스케이드
  const majors = useMemo(() => [...new Set(cats.map((c) => c.major))], [cats]);
  const middles = useMemo(
    () => [...new Set(cats.filter((c) => c.major === major && c.middle).map((c) => c.middle!))],
    [cats, major]
  );
  const matchedCat = useMemo(() => {
    if (!major) return null;
    return (
      cats.find((c) => c.major === major && (middle ? c.middle === middle : !c.middle)) ??
      cats.find((c) => c.major === major && c.isDefault) ??
      cats.find((c) => c.major === major) ??
      null
    );
  }, [cats, major, middle]);

  function pickMajor(m: string) {
    setMajor(m);
    setMiddle("");
    const cat = cats.find((c) => c.major === m && c.isDefault) ?? cats.find((c) => c.major === m);
    if (cat) setCommission(String(cat.commissionRate));
  }
  function pickMiddle(m: string) {
    setMiddle(m);
    const cat = cats.find((c) => c.major === major && c.middle === m);
    if (cat) setCommission(String(cat.commissionRate));
  }
  function pickSize(s: string) {
    setSizeType(s);
    const l = logistics.find((x) => x.sizeType === s);
    if (l) setInboundShip(String(l.inboundFee + l.shippingFee));
  }

  // 착지원가
  const effRate = n(fx) + n(surcharge); // 환율 + 가산(대행 내재)
  const overseasSourcing = Math.round((n(costCny) + n(cnInland)) * effRate);
  const domShipPerUnit =
    shipMode === "per" ? n(domShip) : n(qty) > 0 ? Math.round(n(domShip) / n(qty)) : 0;
  const domesticSourcing = n(costKrw) + domShipPerUnit;
  const sourcingCost = sourcing === "overseas" ? overseasSourcing : domesticSourcing;
  const othersSum = others.reduce((s, o) => s + n(o.amount), 0);
  const landedCost = sourcingCost + othersSum;
  // 최초원가(원가만, 원 환산) — 위안 입력시 헷갈리지 않게 착지원가 옆에 함께 표시
  const baseCostKrw =
    sourcing === "overseas" ? Math.round(n(costCny) * effRate) : n(costKrw);

  const result = useMemo(
    () =>
      calcSimpleMargin({
        salePrice: n(salePrice),
        landedCost,
        inboundShipFee: n(inboundShip),
        commissionPct: n(commission),
        adCost: n(adCost),
      }),
    [salePrice, landedCost, inboundShip, commission, adCost]
  );

  async function save() {
    if (!name) {
      setMsg("상품명을 입력하세요");
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const snapshot = {
        inputs: {
          sourcing,
          // 해외
          costCny: n(costCny),
          cnInland: n(cnInland),
          fx: n(fx),
          surcharge: n(surcharge),
          // 국내
          costKrw: n(costKrw),
          domShip: n(domShip),
          shipMode,
          qty: n(qty),
          // 공통
          others,
          landedCost,
          salePrice: n(salePrice),
          commission: n(commission),
          sizeType,
          inboundShip: n(inboundShip),
          adCost: n(adCost),
          major,
          middle,
        },
        result,
      };
      const r = await fetch("/api/calc/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: editingId ?? undefined,
          name,
          sourceUrl: sourceUrl || undefined,
          categoryId: matchedCat?.id ?? null,
          salePrice: n(salePrice),
          landedCost,
          snapshot,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(j.error ?? j));
      router.push(`/products/${j.productId}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  const verdictVariant =
    result.verdict === "양호" ? "go" : result.verdict === "주의" ? "caution" : "nogo";

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">
          {editingId ? "마진 계산 수정" : "마진 계산"}
        </h1>
        <Button size="sm" variant="outline" onClick={resetForm}>
          <RotateCcw className="h-4 w-4" /> 새 계산
        </Button>
      </div>

      {/* 상품 정보 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4 text-primary" /> 상품 정보
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="상품명 *">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 무지 순면 양말 5족" />
          </Field>
          <Field label="상품 링크 (1688/도매처)">
            <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://..." />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="대분류">
              <Select value={major} onChange={(e) => pickMajor(e.target.value)}>
                <option value="">선택</option>
                {majors.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </Select>
            </Field>
            <Field label="중분류">
              <Select value={middle} onChange={(e) => pickMiddle(e.target.value)} disabled={!major}>
                <option value="">{major ? "대분류 기본" : "-"}</option>
                {middles.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </Select>
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* 1. 사입 원가 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">① 사입 원가 (들여오는 비용)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="사입 방식">
            <div className="grid grid-cols-2 gap-2">
              <Toggle active={sourcing === "overseas"} onClick={() => setSourcing("overseas")}>
                해외 (중국)
              </Toggle>
              <Toggle active={sourcing === "domestic"} onClick={() => setSourcing("domestic")}>
                국내 도매
              </Toggle>
            </div>
          </Field>

          {sourcing === "overseas" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="원가 (위안 ¥)">
                  <Input value={costCny} onChange={(e) => setCostCny(e.target.value)} inputMode="decimal" placeholder="0" />
                </Field>
                <Field label="내륙운송비 (위안 ¥)">
                  <Input value={cnInland} onChange={(e) => setCnInland(e.target.value)} inputMode="decimal" placeholder="0" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label={
                    fxEdited || !fxData?.rate
                      ? "환율 (원/위안)"
                      : `환율 · ${fxData.kind === "cash_buying" ? "현찰살때" : "기준율"}${
                          fxData?.date ? ` (${fxData.date})` : ""
                        }`
                  }
                >
                  <Input
                    value={fx}
                    onChange={(e) => {
                      setFx(e.target.value);
                      setFxEdited(true);
                    }}
                    inputMode="decimal"
                  />
                </Field>
                <Field label="대행 가산 (원/위안)">
                  <Input value={surcharge} onChange={(e) => setSurcharge(e.target.value)} inputMode="decimal" />
                </Field>
              </div>
              <div className="rounded-xl bg-muted px-3.5 py-2.5 text-sm">
                <BreakRow label="원가" value={`${n(costCny) || 0}¥`} />
                <BreakRow label="내륙운송비" value={`${n(cnInland) || 0}¥`} />
                <BreakRow label={`적용환율 (${n(fx) || 0}+${n(surcharge) || 0})`} value={`${effRate}원`} />
                <div className="mt-1 flex items-center justify-between border-t border-border/60 pt-1.5 font-bold">
                  <span>수입대행비</span>
                  <span className="tabular-nums">{won(overseasSourcing)}</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <Field label="원가 (원)">
                <Input value={costKrw} onChange={(e) => setCostKrw(e.target.value)} inputMode="numeric" placeholder="0" />
              </Field>
              <Field label="국내 배송비 (원)">
                <div className="space-y-2">
                  <Input value={domShip} onChange={(e) => setDomShip(e.target.value)} inputMode="numeric" placeholder="0" />
                  <div className="grid grid-cols-2 gap-2">
                    <Toggle active={shipMode === "per"} onClick={() => setShipMode("per")}>
                      개당
                    </Toggle>
                    <Toggle active={shipMode === "once"} onClick={() => setShipMode("once")}>
                      1회 (수량 분배)
                    </Toggle>
                  </div>
                </div>
              </Field>
              {shipMode === "once" && (
                <Field label="주문 수량 (배송비 나눌 개수)">
                  <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" placeholder="1" />
                </Field>
              )}
              {shipMode === "once" && n(domShip) > 0 && (
                <div className="flex items-center justify-between rounded-xl bg-muted px-3.5 py-2.5 text-sm">
                  <span className="text-muted-foreground">
                    개당 배송비 · {won(n(domShip))} ÷ {n(qty) || 1}개
                  </span>
                  <span className="font-bold tabular-nums">{won(domShipPerUnit)}</span>
                </div>
              )}
            </>
          )}

          {/* 기타비용 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">기타비용 (인증비·패키징 등)</span>
              <Button size="sm" variant="outline" onClick={() => setOthers([...others, { label: "", amount: "" }])}>
                <Plus className="h-3.5 w-3.5" /> 추가
              </Button>
            </div>
            {others.map((o, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={o.label}
                  onChange={(e) => setOthers(others.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  placeholder="항목명"
                  className="flex-1"
                />
                <Input
                  value={o.amount}
                  onChange={(e) => setOthers(others.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                  placeholder="금액"
                  inputMode="numeric"
                  className="w-28"
                />
                <Button size="icon" variant="ghost" onClick={() => setOthers(others.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-1 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{sourcing === "overseas" ? "최초원가 (위안→원)" : "최초원가"}</span>
              <span className="tabular-nums">
                {sourcing === "overseas" ? `${n(costCny) || 0}¥ ≈ ${won(baseCostKrw)}` : won(baseCostKrw)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold">= 착지원가 (개당)</span>
              <span className="text-xl font-extrabold tabular-nums">{won(landedCost)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. 판매 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Percent className="h-4 w-4 text-primary" /> ② 쿠팡 판매
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="판매가 (소비자 결제가)">
            <Input value={salePrice} onChange={(e) => setSalePrice(e.target.value)} inputMode="numeric" placeholder="0" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="판매수수료 %">
              <Input value={commission} onChange={(e) => setCommission(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="입출고비 (크기별)">
              <Select value={sizeType} onChange={(e) => pickSize(e.target.value)}>
                <option value="">직접입력</option>
                {logistics.map((l) => (
                  <option key={l.sizeType} value={l.sizeType}>
                    {l.sizeType} ({won(l.inboundFee + l.shippingFee)})
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="입출고+배송비 (원)">
            <Input value={inboundShip} onChange={(e) => setInboundShip(e.target.value)} inputMode="numeric" placeholder="0" />
          </Field>
          <Field label="광고비 (개당, 선택)">
            <Input value={adCost} onChange={(e) => setAdCost(e.target.value)} inputMode="numeric" placeholder="0" />
          </Field>
        </CardContent>
      </Card>

      {/* 결과 */}
      <Card className="border-2 border-primary/30 shadow-pop">
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">최종 마진</span>
            <Badge variant={verdictVariant} className="text-sm">
              {result.verdict}
            </Badge>
          </div>
          <div className="flex items-end gap-3">
            <span className={`text-4xl font-extrabold tabular-nums ${result.marginAfterAd < 0 ? "text-red-600" : ""}`}>
              {won(result.marginAfterAd)}
            </span>
            <span className="pb-1 text-lg font-bold text-muted-foreground">
              {pct(result.marginRateAfterAd)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <Line label="착지원가" value={won(result.landedCost)} />
            <Line label="판매수수료" value={won(result.commission)} />
            <Line label="입출고비" value={won(result.inboundShipFee)} />
            <Line label="납부부가세" value={won(result.vatPayable)} />
            {n(adCost) > 0 && <Line label="광고전마진" value={won(result.margin)} />}
            {n(adCost) > 0 && <Line label="광고비" value={won(n(adCost))} />}
            <Line
              label="손익 ROAS"
              value={result.breakevenRoas > 0 ? `${result.breakevenRoas}배` : "-"}
            />
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-accent px-3 py-2 text-xs leading-relaxed text-accent-foreground">
            <Megaphone className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              광고하려면 <b className="whitespace-nowrap">ROAS {result.breakevenRoas || "-"}배</b> 넘어야 남아요.
            </span>
          </div>
        </CardContent>
      </Card>

      {msg && <p className="text-sm text-destructive">{msg}</p>}
      <Button size="lg" className="w-full" onClick={save} disabled={saving}>
        <Save /> {saving ? "저장 중…" : editingId ? "수정 저장하기" : "후보로 저장하기"}
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="h-11 w-full rounded-xl border-2 border-input bg-card px-3 text-base focus-visible:border-primary/50 focus-visible:outline-none disabled:opacity-50"
    />
  );
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 rounded-xl border-2 text-sm font-semibold transition-all active:scale-[0.98] ${
        active
          ? "border-primary bg-primary text-primary-foreground shadow-pop"
          : "border-input bg-card text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-1 whitespace-nowrap">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function BreakRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
