"use client";

import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Upload } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { won, pct } from "@/lib/utils";
import { todayIso } from "@/lib/date";

type Category = {
  id: number;
  major: string;
  middle: string | null;
  minor: string | null;
  commissionRate: string;
  serviceFeeThreshold: number | null;
  rgEligible: boolean;
  isVerified: boolean;
};
type Logistics = { id: number; sizeType: string; inboundFee: number; shippingFee: number; isVerified: boolean };
type Misc = { id: number; feeKey: string; feeNameKo: string; unit: string; amount: string | null; freeQuota: number | null; freeDays: number | null; isVerified: boolean; note: string | null };

const TABS = [
  { key: "category", label: "카테고리 요율" },
  { key: "logistics", label: "물류비" },
  { key: "misc", label: "기타" },
] as const;

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function VerifyBadge({ v }: { v: boolean }) {
  return v ? <Badge variant="secondary">검증됨</Badge> : <Badge variant="warn">미검증</Badge>;
}

export default function FeesPage() {
  const [tab, setTab] = useState<string>("category");
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">수수료</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-warn">미검증</span>은 윙에서 확인 후 교체하세요.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/settings/fees/import">
            <Upload className="h-4 w-4" /> 업로드
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-xl border-2 py-2 text-sm font-semibold transition-all active:scale-[0.98] ${
              tab === t.key ? "border-primary bg-accent" : "border-border/60 bg-card"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "category" && <CategoryTab />}
      {tab === "logistics" && <LogisticsTab />}
      {tab === "misc" && <MiscTab />}
    </div>
  );
}

function CategoryTab() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["fees", "category"],
    queryFn: () => getJson<{ rows: Category[] }>("/api/fees/category"),
  });
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [rate, setRate] = useState("");

  const verify = useMutation({
    mutationFn: (id: number) =>
      fetch("/api/fees/category", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify", id }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fees", "category"] }),
  });
  const reprice = useMutation({
    mutationFn: (v: { id: number; commissionRate: string }) =>
      fetch("/api/fees/category", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reprice", id: v.id, commissionRate: v.commissionRate, effectiveFrom: todayIso(), isVerified: true }) }),
    onSuccess: () => { setEditing(null); qc.invalidateQueries({ queryKey: ["fees", "category"] }); },
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrText error={error} />;
  const rows = (data?.rows ?? []).filter((r) => `${r.major}${r.middle ?? ""}${r.minor ?? ""}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="space-y-3">
      <Input placeholder="카테고리 검색 (예: 패션, 잡화)" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="space-y-2.5">
        {rows.map((r) => (
          <Card key={r.id}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {r.major}
                  {r.middle ? ` › ${r.middle}` : ""}
                  {r.minor ? ` › ${r.minor}` : ""}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <VerifyBadge v={r.isVerified} />
                  {!r.rgEligible && <Badge variant="nogo">RG 불가</Badge>}
                </div>
              </div>
              <div className="shrink-0 text-right">
                {editing === r.id ? (
                  <div className="flex items-center gap-1">
                    <Input value={rate} onChange={(e) => setRate(e.target.value)} className="h-9 w-20 text-right" inputMode="decimal" />
                    <Button size="sm" onClick={() => reprice.mutate({ id: r.id, commissionRate: rate })}>저장</Button>
                  </div>
                ) : (
                  <button className="text-xl font-extrabold tabular-nums hover:underline" onClick={() => { setEditing(r.id); setRate(String(r.commissionRate)); }}>
                    {pct(r.commissionRate)}
                  </button>
                )}
                {!r.isVerified && editing !== r.id && (
                  <button className="mt-1 block text-xs text-primary" onClick={() => verify.mutate(r.id)}>검증표시</button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function LogisticsTab() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["fees", "logistics"], queryFn: () => getJson<{ rows: Logistics[] }>("/api/fees/logistics") });
  const [editing, setEditing] = useState<number | null>(null);
  const [inbound, setInbound] = useState("");
  const [shipping, setShipping] = useState("");
  const update = useMutation({
    mutationFn: (id: number) =>
      fetch("/api/fees/logistics", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update", id, inboundFee: Number(inbound), shippingFee: Number(shipping), effectiveFrom: todayIso(), isVerified: true }) }),
    onSuccess: () => { setEditing(null); qc.invalidateQueries({ queryKey: ["fees", "logistics"] }); },
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrText error={error} />;

  return (
    <div className="space-y-3">
      <p className="rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn-foreground">
        🔴 현재는 공식 <b>하한값</b>입니다. 실제는 카테고리×사이즈×판매가로 달라져요 — 윙 확인 후 수정.
      </p>
      <div className="space-y-2.5">
        {(data?.rows ?? []).map((r) => (
          <Card key={r.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-lg font-extrabold">{r.sizeType}</span>
                <VerifyBadge v={r.isVerified} />
              </div>
              {editing === r.id ? (
                <div className="mt-2 space-y-2">
                  <label className="flex items-center justify-between gap-2 text-sm">입출고비 <Input value={inbound} onChange={(e) => setInbound(e.target.value)} className="h-9 w-28 text-right" inputMode="numeric" /></label>
                  <label className="flex items-center justify-between gap-2 text-sm">배송비 <Input value={shipping} onChange={(e) => setShipping(e.target.value)} className="h-9 w-28 text-right" inputMode="numeric" /></label>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" onClick={() => update.mutate(r.id)}>저장</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>취소</Button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex items-center justify-between">
                  <div className="text-sm">
                    <span className="text-muted-foreground">입출고 </span><b className="tabular-nums">{won(r.inboundFee)}</b>
                    <span className="ml-3 text-muted-foreground">배송 </span><b className="tabular-nums">{won(r.shippingFee)}</b>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => { setEditing(r.id); setInbound(String(r.inboundFee)); setShipping(String(r.shippingFee)); }}>편집</Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function MiscTab() {
  const { data, isLoading, error } = useQuery({ queryKey: ["fees", "misc"], queryFn: () => getJson<{ rows: Misc[] }>("/api/fees/misc") });
  if (isLoading) return <Loading />;
  if (error) return <ErrText error={error} />;
  return (
    <div className="space-y-2.5">
      {(data?.rows ?? []).map((r) => (
        <Card key={r.id}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{r.feeNameKo}</span>
              <span className="tabular-nums font-bold">{r.unit === "rate" ? pct(r.amount) : r.amount ? won(r.amount) : "미확인"}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <VerifyBadge v={r.isVerified} />
              {r.freeQuota != null && <span>무료 {r.freeQuota}건/월</span>}
              {r.freeDays != null && <span>무료 {r.freeDays}일</span>}
            </div>
            {r.note && <p className="mt-1 text-xs text-muted-foreground">{r.note}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Loading() {
  return <p className="text-sm text-muted-foreground">불러오는 중…</p>;
}
function ErrText({ error }: { error: unknown }) {
  return <p className="text-sm text-destructive">DB 연결/셋업 필요: {String(error)}</p>;
}
