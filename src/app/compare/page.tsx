"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { won, pct } from "@/lib/utils";

type Product = {
  id: number;
  name: string;
  status: string;
  salePrice: number | null;
  marginAfterAd: number | null;
  marginRate: number | null;
  verdict: string | null;
};

type SortKey = "marginAfterAd" | "marginRate";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "marginAfterAd", label: "개당 마진" },
  { key: "marginRate", label: "마진율" },
];

export default function ComparePage() {
  const [sort, setSort] = useState<SortKey>("marginAfterAd");
  const { data, isLoading, error } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const r = await fetch("/api/products");
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<{ rows: Product[] }>;
    },
  });

  const rows = (data?.rows ?? [])
    .filter((p) => p.status !== "중단" && p.marginAfterAd !== null)
    .sort((a, b) => (b[sort] ?? -Infinity) - (a[sort] ?? -Infinity));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">비교 분석</h1>
        <p className="text-sm text-muted-foreground">저장한 상품을 마진 순으로 줄 세웁니다 (폐기 제외).</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {SORTS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSort(s.key)}
            className={`rounded-xl border-2 py-2.5 text-sm font-semibold transition-all active:scale-[0.98] ${
              sort === s.key ? "border-primary bg-primary text-primary-foreground" : "border-border/60 bg-card"
            }`}
          >
            {s.label} 순
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">불러오는 중…</p>}
      {error && <p className="text-sm text-destructive">DB 연결 필요: {String(error)}</p>}

      {data && rows.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            비교할 상품이 없어요.{" "}
            <Link href="/calc" className="font-semibold text-primary underline">
              마진 계산
            </Link>{" "}
            후 저장해보세요.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2.5">
        {rows.map((p, i) => (
          <Link key={p.id} href={`/products/${p.id}`}>
            <Card className="transition-all active:scale-[0.99]">
              <CardContent className="flex items-center gap-3 p-4">
                <div
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-extrabold ${
                    i === 0
                      ? "bg-amber-400 text-amber-950"
                      : i === 1
                        ? "bg-slate-300 text-slate-800"
                        : i === 2
                          ? "bg-orange-300 text-orange-950"
                          : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i < 3 ? <Trophy className="h-4 w-4" /> : i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{p.name}</p>
                  <p className="text-sm text-muted-foreground">
                    판매가 {won(p.salePrice)} · {pct(p.marginRate)}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`font-extrabold tabular-nums ${p.marginAfterAd! < 0 ? "text-red-600" : ""}`}>
                    {won(p.marginAfterAd)}
                  </p>
                  {p.verdict && (
                    <Badge
                      variant={p.verdict === "양호" ? "go" : p.verdict === "주의" ? "caution" : "nogo"}
                      className="mt-0.5"
                    >
                      {p.verdict}
                    </Badge>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
