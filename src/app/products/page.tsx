"use client";

import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, Trash2, RotateCcw, PackagePlus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { won, pct } from "@/lib/utils";

type Product = {
  id: number;
  name: string;
  status: string;
  sourceUrl: string | null;
  salePrice: number | null;
  marginAfterAd: number | null;
  marginRate: number | null;
  verdict: string | null;
};

const TABS = [
  { key: "검토중", label: "후보" },
  { key: "판매중", label: "판매중" },
  { key: "중단", label: "폐기" },
] as const;

export default function ProductsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<string>("검토중");
  const { data, isLoading, error } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const r = await fetch("/api/products");
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<{ rows: Product[] }>;
    },
  });

  const setStatus = useMutation({
    mutationFn: (v: { id: number; status: string }) =>
      fetch(`/api/products/${v.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: v.status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });

  const all = data?.rows ?? [];
  const counts = {
    검토중: all.filter((p) => p.status === "검토중").length,
    판매중: all.filter((p) => p.status === "판매중").length,
    중단: all.filter((p) => p.status === "중단").length,
  };
  const rows = all.filter((p) => p.status === tab);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">상품 목록</h1>
        <Button asChild size="sm">
          <Link href="/calc">
            <PackagePlus className="h-4 w-4" /> 계산하기
          </Link>
        </Button>
      </div>

      {/* 상태 탭 */}
      <div className="grid grid-cols-3 gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-xl border-2 py-2.5 text-center transition-all active:scale-[0.98] ${
              tab === t.key ? "border-primary bg-accent" : "border-border/60 bg-card"
            }`}
          >
            <div className="text-2xl font-extrabold tabular-nums">
              {counts[t.key as keyof typeof counts]}
            </div>
            <div className="text-xs text-muted-foreground">{t.label}</div>
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">불러오는 중…</p>}
      {error && <p className="text-sm text-destructive">DB 연결 필요: {String(error)}</p>}

      {data && rows.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {tab === "검토중" ? (
              <>
                후보가 없어요.{" "}
                <Link href="/calc" className="font-semibold text-primary underline">
                  마진 계산
                </Link>
                해서 저장해보세요.
              </>
            ) : (
              "해당 상태의 상품이 없습니다."
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {rows.map((p) => (
          <Card key={p.id}>
            <CardContent className="space-y-3 p-4">
              <Link href={`/products/${p.id}`} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-bold">{p.name}</p>
                  <p className="text-sm text-muted-foreground">
                    판매가 {won(p.salePrice)} · 마진{" "}
                    <span className={p.marginAfterAd !== null && p.marginAfterAd < 0 ? "text-red-600" : "text-foreground"}>
                      {won(p.marginAfterAd)} ({pct(p.marginRate)})
                    </span>
                  </p>
                </div>
                {p.verdict && (
                  <Badge variant={p.verdict === "양호" ? "go" : p.verdict === "주의" ? "caution" : "nogo"}>
                    {p.verdict}
                  </Badge>
                )}
              </Link>

              <div className="flex gap-2">
                {p.status === "검토중" && (
                  <>
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => setStatus.mutate({ id: p.id, status: "판매중" })}
                    >
                      <CheckCircle2 className="h-4 w-4" /> 판매등록
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setStatus.mutate({ id: p.id, status: "중단" })}
                    >
                      <Trash2 className="h-4 w-4" /> 폐기
                    </Button>
                  </>
                )}
                {p.status === "판매중" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setStatus.mutate({ id: p.id, status: "중단" })}
                  >
                    <Trash2 className="h-4 w-4" /> 판매 중단
                  </Button>
                )}
                {p.status === "중단" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setStatus.mutate({ id: p.id, status: "검토중" })}
                  >
                    <RotateCcw className="h-4 w-4" /> 후보로 복원
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
