"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, Save, Package, Percent, Megaphone } from "lucide-react";
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

  // 상품
  const [name, setName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [major, setMajor] = useState("");
  const [middle, setMiddle] = useState("");

  // 사입
  const [sourcing, setSourcing] = useState<"overseas" | "domestic">("overseas");
  // 해외 (중국): (원가위안 + 내륙운송비위안) × (환율 + 가산)
  const [costCny, setCostCny] = useState("");
  const [cnInland, setCnInland] = useState("");
  const [fx, setFx] = useState("190");
  const [fxEdited, setFxEdited] = useState(false);
  const [surcharge, setSurcharge] = useState("80");

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
  const [costKrw, setCostKrw] = useState("");
  const [domShip, setDomShip] = useState("");
  const [shipMode, setShipMode] = useState<"per" | "once">("per");
  const [qty, setQty] = useState("1");
  const [others, setOthers] = useState<{ label: string; amount: string }[]>([]);

  // 판매
  const [salePrice, setSalePrice] = useState("");
  const [commission, setCommission] = useState("10.8");
  const [sizeType, setSizeType] = useState("");
  const [inboundShip, setInboundShip] = useState("");
  const [adCost, setAdCost] = useState("");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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
      router.push("/products");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  const verdictVariant =
    result.verdict === "양호" ? "go" : result.verdict === "주의" ? "caution" : "nogo";

  return (
    <div className="space-y-4 pb-4">
      <h1 className="text-2xl font-extrabold tracking-tight">마진 계산</h1>

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
              <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                수입대행비 = (원가 {n(costCny) || 0}¥ + 내륙 {n(cnInland) || 0}¥) × (환율 {n(fx) || 0} + {n(surcharge) || 0}) ={" "}
                <b className="text-foreground">{won(overseasSourcing)}</b>
              </p>
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
                <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                  개당 배송비 = {won(n(domShip))} ÷ {n(qty) || 1}개 = <b className="text-foreground">{won(domShipPerUnit)}</b>
                </p>
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

          <div className="flex items-center justify-between rounded-xl bg-muted px-4 py-3">
            <span className="text-sm font-medium">= 착지원가 (개당)</span>
            <span className="text-lg font-extrabold tabular-nums">{won(landedCost)}</span>
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
            {n(adCost) > 0 && <Line label="광고 전 마진" value={won(result.margin)} />}
            <Line
              label="손익분기 ROAS"
              value={result.breakevenRoas > 0 ? `${result.breakevenRoas}배` : "-"}
            />
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs text-accent-foreground">
            <Megaphone className="h-4 w-4 shrink-0" />
            광고 ROAS가 <b>{result.breakevenRoas || "-"}배</b> 이상이어야 광고 붙여도 남습니다.
          </div>
        </CardContent>
      </Card>

      {msg && <p className="text-sm text-destructive">{msg}</p>}
      <Button size="lg" className="w-full" onClick={save} disabled={saving}>
        <Save /> {saving ? "저장 중…" : "후보로 저장하기"}
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
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
