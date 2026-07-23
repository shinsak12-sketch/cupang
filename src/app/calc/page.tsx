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
  // 수입 관세·부가세 (사업자 일반수입)
  const [customsOn, setCustomsOn] = usePersistentState("calc.customsOn", false);
  const [tariffPct, setTariffPct] = usePersistentState("calc.tariffPct", "8");
  const [vatOn, setVatOn] = usePersistentState("calc.vatOn", false);

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
  // 반품 (실마진 반영)
  const [returnRatePct, setReturnRatePct] = usePersistentState("calc.returnRatePct", "3");
  const [returnResalable, setReturnResalable] = usePersistentState("calc.returnResalable", true);
  // 역산 도우미
  const [revTargetRate, setRevTargetRate] = usePersistentState("calc.revTargetRate", "20");
  const [revCompPrice, setRevCompPrice] = usePersistentState("calc.revCompPrice", "");
  const [revTargetRate2, setRevTargetRate2] = usePersistentState("calc.revTargetRate2", "20");

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
    setCustomsOn(false);
    setTariffPct("8");
    setVatOn(false);
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
    setReturnRatePct("3");
    setReturnResalable(true);
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
      setCustomsOn(!!inp.customsOn);
      if (inp.tariffPct != null) setTariffPct(String(inp.tariffPct));
      setVatOn(!!inp.vatOn);
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
      if (inp.returnRatePct != null) setReturnRatePct(String(inp.returnRatePct));
      if (inp.returnResalable != null) setReturnResalable(!!inp.returnResalable);
    })();
  }, []);

  // ?name= / ?link= → 상품찾기에서 넘어올 때 프리필 (기존 입력이 있으면 유지)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const nm = p.get("name");
    const link = p.get("link");
    const sale = p.get("sale");
    if (nm) setName((prev) => prev || nm);
    if (link) setSourceUrl((prev) => prev || link);
    if (sale && /^\d+$/.test(sale)) setSalePrice((prev) => prev || sale);
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
  // 관세는 해외(수입)에만. 과세가격 ≈ 수입대행비(물품가+운송)
  const dutiable = sourcing === "overseas" ? overseasSourcing : 0;
  const duty = customsOn ? Math.round(dutiable * (n(tariffPct) / 100)) : 0;
  const importVat = customsOn && vatOn ? Math.round((dutiable + duty) * 0.1) : 0;
  const landedCost = sourcingCost + othersSum + duty + importVat;
  // 최초원가(원가만, 원 환산) — 위안 입력시 헷갈리지 않게 착지원가 옆에 함께 표시
  const baseCostKrw =
    sourcing === "overseas" ? Math.round(n(costCny) * effRate) : n(costKrw);

  // 반품 1건당 손실 = 반품물류비(≈입출고비) + (재판매 불가 시 착지원가)
  const returnLossPerReturn = n(inboundShip) + (returnResalable ? 0 : landedCost);

  const result = useMemo(
    () =>
      calcSimpleMargin({
        salePrice: n(salePrice),
        landedCost,
        inboundShipFee: n(inboundShip),
        commissionPct: n(commission),
        adCost: n(adCost),
        returnRatePct: n(returnRatePct),
        returnLossPerReturn,
      }),
    [salePrice, landedCost, inboundShip, commission, adCost, returnRatePct, returnLossPerReturn]
  );

  // 역산: 현재 수수료·입출고·반품 설정을 그대로 두고 판매가/착지원가를 이분탐색
  const marginRateAt = (sp: number, ld: number) => {
    const rl = n(inboundShip) + (returnResalable ? 0 : ld);
    return calcSimpleMargin({
      salePrice: sp,
      landedCost: ld,
      inboundShipFee: n(inboundShip),
      commissionPct: n(commission),
      adCost: n(adCost),
      returnRatePct: n(returnRatePct),
      returnLossPerReturn: rl,
    }).marginRateAfterReturn;
  };
  const bisectPrice = (target: number): number | null => {
    let lo = Math.max(100, landedCost);
    let hi = Math.max(lo * 20, 2_000_000);
    if (marginRateAt(hi, landedCost) < target) return null;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (marginRateAt(mid, landedCost) < target) lo = mid;
      else hi = mid;
    }
    return Math.ceil(hi / 10) * 10;
  };
  const bisectLanded = (price: number, target: number): number | null => {
    if (price <= 0) return null;
    if (marginRateAt(price, 0) < target) return null; // 공짜 사입해도 목표 미달
    let lo = 0;
    let hi = price;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (marginRateAt(price, mid) >= target) lo = mid;
      else hi = mid;
    }
    return Math.floor(lo / 10) * 10;
  };
  const revPrice = landedCost > 0 && n(revTargetRate) > 0 ? bisectPrice(n(revTargetRate)) : null;
  const revMaxLanded = n(revCompPrice) > 0 && n(revTargetRate2) > 0 ? bisectLanded(n(revCompPrice), n(revTargetRate2)) : null;
  // 손익분기 판매가 (실마진 0이 되는 가격)
  const breakevenPrice = landedCost > 0 ? bisectPrice(0) : null;

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
          customsOn,
          tariffPct: n(tariffPct),
          vatOn,
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
          returnRatePct: n(returnRatePct),
          returnResalable,
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

              {/* 수입 관세·부가세 */}
              <div className="rounded-xl border-2 border-input p-3">
                <label className="flex cursor-pointer items-center justify-between">
                  <span className="text-sm font-medium">수입 관세 적용 <span className="text-xs text-muted-foreground">(사업자 일반수입)</span></span>
                  <input
                    type="checkbox"
                    checked={customsOn}
                    onChange={(e) => setCustomsOn(e.target.checked)}
                    className="h-5 w-5 accent-primary"
                  />
                </label>
                {customsOn && (
                  <div className="mt-3 space-y-2">
                    <Field label="관세율 % (품목 HS 기준)">
                      <Input value={tariffPct} onChange={(e) => setTariffPct(e.target.value)} inputMode="decimal" placeholder="8" />
                    </Field>
                    <label className="flex cursor-pointer items-center justify-between rounded-lg bg-muted px-3 py-2">
                      <span className="text-sm">
                        부가세(10%) 포함 <span className="text-xs text-muted-foreground">보통 매입공제됨</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={vatOn}
                        onChange={(e) => setVatOn(e.target.checked)}
                        className="h-5 w-5 accent-primary"
                      />
                    </label>
                    <div className="rounded-xl bg-muted px-3.5 py-2 text-sm">
                      <BreakRow label={`관세 (${n(tariffPct) || 0}%)`} value={won(duty)} />
                      {vatOn && <BreakRow label="수입부가세 (10%)" value={won(importVat)} />}
                    </div>
                  </div>
                )}
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
            {customsOn && duty > 0 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>+ 관세{vatOn ? "·부가세" : ""}</span>
                <span className="tabular-nums">{won(duty + importVat)}</span>
              </div>
            )}
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
          {breakevenPrice != null && (
            <div>
              <input
                type="range"
                min={breakevenPrice}
                max={Math.max(breakevenPrice * 3, n(salePrice) || 0)}
                step={100}
                value={Math.min(Math.max(n(salePrice) || breakevenPrice, breakevenPrice), Math.max(breakevenPrice * 3, n(salePrice) || 0))}
                onChange={(e) => setSalePrice(e.target.value)}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">손익분기 {won(breakevenPrice)}</span>
                <span className={result.marginAfterReturn < 0 ? "font-semibold text-red-600" : "font-semibold text-emerald-600"}>
                  실마진 {won(result.marginAfterReturn)} ({pct(result.marginRateAfterReturn)})
                </span>
              </div>
            </div>
          )}
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

      {/* 3. 반품 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">③ 반품 (실마진 반영)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="반품률 %">
              <Input value={returnRatePct} onChange={(e) => setReturnRatePct(e.target.value)} inputMode="decimal" placeholder="3" />
            </Field>
            <Field label="반품 상품 재판매">
              <div className="grid grid-cols-2 gap-2">
                <Toggle active={returnResalable} onClick={() => setReturnResalable(true)}>
                  가능
                </Toggle>
                <Toggle active={!returnResalable} onClick={() => setReturnResalable(false)}>
                  불가(폐기)
                </Toggle>
              </div>
            </Field>
          </div>
          <div className="rounded-xl bg-muted px-3.5 py-2.5 text-sm">
            <BreakRow label="반품 1건 손실" value={won(returnLossPerReturn)} />
            <div className="mt-1 flex items-center justify-between border-t border-border/60 pt-1.5 font-bold">
              <span>반품비용 ({n(returnRatePct) || 0}% 반영)</span>
              <span className="tabular-nums text-red-600">-{won(result.returnCost)}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            반품물류비 ≈ 입출고비 기준 추정. <b>재판매 불가</b>면 착지원가까지 손실. 로켓그로스 반품률 보통 2~5%.
          </p>
        </CardContent>
      </Card>

      {/* 결과 */}
      <Card className="border-2 border-primary/30 shadow-pop">
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              실마진 <span className="text-xs">(광고·반품 반영)</span>
            </span>
            <Badge variant={verdictVariant} className="text-sm">
              {result.verdict}
            </Badge>
          </div>
          <div className="flex items-end gap-3">
            <span className={`text-4xl font-extrabold tabular-nums ${result.marginAfterReturn < 0 ? "text-red-600" : ""}`}>
              {won(result.marginAfterReturn)}
            </span>
            <span className="pb-1 text-lg font-bold text-muted-foreground">
              {pct(result.marginRateAfterReturn)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <Line label="착지원가" value={won(result.landedCost)} />
            <Line label="판매수수료" value={won(result.commission)} />
            <Line label="입출고비" value={won(result.inboundShipFee)} />
            <Line label="납부부가세" value={won(result.vatPayable)} />
            <Line label="장부상 마진" value={won(result.margin)} />
            {n(adCost) > 0 && <Line label="광고비" value={`-${won(n(adCost))}`} />}
            {result.returnCost > 0 && <Line label="반품비용" value={`-${won(result.returnCost)}`} />}
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

      {/* 역산 도우미 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">🔄 역산 도우미</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 목표 마진율 → 필요 판매가 */}
          <div>
            <p className="mb-1 text-sm font-semibold">목표 마진율 → 필요 판매가</p>
            <p className="mb-2 text-xs text-muted-foreground">현재 착지원가 {won(landedCost)} 기준</p>
            <div className="flex items-center gap-2">
              <Input
                value={revTargetRate}
                onChange={(e) => setRevTargetRate(e.target.value)}
                inputMode="decimal"
                placeholder="20"
                className="w-20"
              />
              <span className="text-sm">% 남기려면 →</span>
              <span className="text-lg font-extrabold tabular-nums">
                {landedCost <= 0 ? "원가 먼저" : revPrice != null ? won(revPrice) : "불가"}
              </span>
              {revPrice != null && (
                <Button size="sm" variant="outline" className="ml-auto" onClick={() => setSalePrice(String(revPrice))}>
                  적용
                </Button>
              )}
            </div>
          </div>

          <div className="border-t border-border/60" />

          {/* 경쟁가 + 목표마진 → 착지원가 상한 */}
          <div>
            <p className="mb-1 text-sm font-semibold">경쟁가 → 사입 상한</p>
            <p className="mb-2 text-xs text-muted-foreground">이 가격에 팔면서 목표마진 남기려면 착지원가는?</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="경쟁 판매가">
                <Input value={revCompPrice} onChange={(e) => setRevCompPrice(e.target.value)} inputMode="numeric" placeholder="9900" />
              </Field>
              <Field label="목표 마진율 %">
                <Input value={revTargetRate2} onChange={(e) => setRevTargetRate2(e.target.value)} inputMode="decimal" placeholder="20" />
              </Field>
            </div>
            <div className="mt-2 flex items-center justify-between rounded-xl bg-muted px-3.5 py-2.5 text-sm">
              <span className="text-muted-foreground">→ 착지원가 이하로 사입</span>
              <span className="text-lg font-extrabold tabular-nums text-primary">
                {n(revCompPrice) <= 0 ? "-" : revMaxLanded != null ? `${won(revMaxLanded)} 이하` : "불가"}
              </span>
            </div>
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
