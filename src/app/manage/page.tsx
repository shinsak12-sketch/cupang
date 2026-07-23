"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Trash2, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { won } from "@/lib/utils";

type Product = {
  id: number;
  name: string;
  status: string;
  salePrice: number | null;
  marginAfterAd: number | null;
};
type Sale = {
  id: number;
  ym: string;
  soldQty: number | null;
  returnedQty: number | null;
  settlementAmount: string | null;
};

const thisYm = () => new Date().toISOString().slice(0, 7);

export default function ManagePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const r = await fetch("/api/products");
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<{ rows: Product[] }>;
    },
  });
  const [showAll, setShowAll] = useState(false);

  const all = data?.rows ?? [];
  const rows = showAll ? all.filter((p) => p.status !== "중단") : all.filter((p) => p.status === "판매중");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">상품 관리</h1>
        <p className="text-sm text-muted-foreground">판매중 상품의 월별 판매수량을 입력해 실적을 쌓아요.</p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
        후보 상품도 표시
      </label>

      {isLoading && <p className="text-sm text-muted-foreground">불러오는 중…</p>}
      {error && <p className="text-sm text-destructive">DB 셋업 필요: {String(error)}</p>}

      {data && rows.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            판매중 상품이 없어요.{" "}
            <Link href="/products" className="font-semibold text-primary underline">목록</Link>
            에서 후보를 판매등록 하세요.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {rows.map((p) => (
          <ManageCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  );
}

function ManageCard({ product }: { product: Product }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [ym, setYm] = useState(thisYm());
  const [qty, setQty] = useState("");
  const [returned, setReturned] = useState("");
  const [actual, setActual] = useState("");

  const { data } = useQuery({
    queryKey: ["sales", product.id],
    queryFn: async () => {
      const r = await fetch(`/api/sales?productId=${product.id}`);
      return r.ok ? ((await r.json()).rows as Sale[]) : [];
    },
    enabled: open,
  });

  const save = useMutation({
    mutationFn: (body: object) =>
      fetch("/api/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => {
      setQty("");
      setReturned("");
      setActual("");
      qc.invalidateQueries({ queryKey: ["sales", product.id] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
  const del = useMutation({
    mutationFn: (id: number) => fetch(`/api/sales?id=${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales", product.id] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const unit = product.marginAfterAd ?? 0;
  const sales = data ?? [];
  const net = (x: Sale) => (x.soldQty ?? 0) - (x.returnedQty ?? 0); // 순판매
  const totalNetQty = sales.reduce((s, x) => s + net(x), 0);
  const totalEst = totalNetQty * unit;
  const actualRows = sales.filter((x) => x.settlementAmount != null);
  const totalActual = actualRows.reduce((s, x) => s + Number(x.settlementAmount), 0);
  const estForActual = actualRows.reduce((s, x) => s + net(x) * unit, 0);
  const diff = totalActual - estForActual;
  const hasActual = actualRows.length > 0;

  return (
    <Card>
      <CardContent className="p-0">
        <button className="flex w-full items-center gap-2 p-4 text-left" onClick={() => setOpen(!open)}>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{product.name}</p>
            <p className="text-sm text-muted-foreground">
              개당 마진 {won(unit)}
              {product.status !== "판매중" && <Badge variant="warn" className="ml-2">후보</Badge>}
            </p>
          </div>
          {open ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
        </button>

        {open && (
          <div className="space-y-3 border-t border-border/60 p-4">
            {/* 입력 폼 */}
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">월</span>
                <Input type="month" value={ym} onChange={(e) => setYm(e.target.value)} className="h-10 w-36" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">판매</span>
                <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" placeholder="0" className="h-10 w-20" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">반품</span>
                <Input value={returned} onChange={(e) => setReturned(e.target.value)} inputMode="numeric" placeholder="0" className="h-10 w-20" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">실제 순이익(선택)</span>
                <Input value={actual} onChange={(e) => setActual(e.target.value)} inputMode="numeric" placeholder="원" className="h-10 w-28" />
              </label>
              <Button
                size="sm"
                className="h-10"
                disabled={!qty}
                onClick={() =>
                  save.mutate({
                    productId: product.id,
                    ym,
                    soldQty: Number(qty) || 0,
                    returnedQty: Number(returned) || 0,
                    settlementAmount: actual ? Number(actual.replace(/[,\s]/g, "")) : null,
                  })
                }
              >
                <Plus className="h-4 w-4" /> 저장
              </Button>
            </div>

            {/* 누적 */}
            <div className="space-y-1 rounded-xl bg-primary/5 px-4 py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">순판매 {totalNetQty.toLocaleString("ko-KR")}개</span>
                <span className="font-extrabold tabular-nums">추정 마진 {won(totalEst)}</span>
              </div>
              {hasActual && (
                <div className="flex items-center justify-between border-t border-border/60 pt-1 text-sm">
                  <span className="font-medium">실제 순이익 {won(totalActual)}</span>
                  <span className={`font-bold tabular-nums ${diff >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {diff >= 0 ? "+" : ""}
                    {won(diff)} vs 추정
                  </span>
                </div>
              )}
            </div>

            {/* 월별 목록 */}
            <div className="space-y-1.5">
              {sales.map((s) => {
                const a = s.settlementAmount != null ? Number(s.settlementAmount) : null;
                const est = net(s) * unit;
                return (
                  <div key={s.id} className="flex items-center gap-2 text-sm">
                    <span className="w-20 font-mono">{s.ym}</span>
                    <span className="flex-1 text-muted-foreground">
                      판매 {s.soldQty ?? 0}
                      {s.returnedQty ? ` · 반품 ${s.returnedQty}` : ""} · 추정 {won(est)}
                      {a != null && (
                        <>
                          {" · "}
                          <b className="text-foreground">실제 {won(a)}</b>
                          <span className={a - est >= 0 ? "text-emerald-600" : "text-red-600"}>
                            {" "}
                            ({a - est >= 0 ? "+" : ""}
                            {won(a - est)})
                          </span>
                        </>
                      )}
                    </span>
                    <button onClick={() => del.mutate(s.id)} className="text-muted-foreground">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
              {sales.length === 0 && <p className="text-xs text-muted-foreground">아직 입력된 월이 없어요.</p>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
