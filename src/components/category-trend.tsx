"use client";

import { useQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type Pt = { direction: "up" | "flat" | "down"; changePct: number | null };
type Row = { name: string; cid: string; p3: Pt; p6: Pt; p12: Pt; series: number[] };

/** 네이버쇼핑 대분류 상대 성과(전분야 평균 대비) — 매일 바뀌지 않아 홈에 상주. */
export function CategoryTrend() {
  const insight = useQuery({
    queryKey: ["insight-multi"],
    staleTime: 6 * 3600_000,
    retry: false,
    queryFn: async () => {
      const r = await fetch(`/api/insight`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "쇼핑인사이트 실패");
      return (j.items ?? []) as Row[];
    },
  });

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-1 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <span className="font-bold">분야 트렌드</span>
          <span className="text-xs text-muted-foreground">네이버쇼핑 대분류 · 상대 성과</span>
        </div>
        <p className="mb-2 text-[11px] text-muted-foreground">
          전년 동기 대비를 <b>전분야 평균과 비교</b>. +면 시장평균보다 선전(상대적으로 뜨는 분야).
        </p>
        {insight.isLoading && <p className="mt-2 text-sm text-muted-foreground">조회 중…</p>}
        {insight.error && (
          <p className="mt-2 text-xs text-muted-foreground">쇼핑인사이트 미연동 · NCP 키 확인</p>
        )}
        {insight.data && insight.data.length > 0 && (
          <div className="mt-2">
            <div className="grid grid-cols-[1fr_3.2rem_3.2rem_3.2rem] items-center gap-1 pb-1 text-[11px] font-medium text-muted-foreground">
              <span>분야</span>
              <span className="text-right">3개월</span>
              <span className="text-right">6개월</span>
              <span className="text-right">12개월</span>
            </div>
            <div className="divide-y divide-border/40">
              {[...insight.data]
                .sort((a, b) => (b.p3.changePct ?? -999) - (a.p3.changePct ?? -999))
                .map((c) => (
                  <div key={c.cid} className="grid grid-cols-[1fr_3.2rem_3.2rem_3.2rem] items-center gap-1 py-2">
                    <span className="truncate text-sm font-medium">{c.name}</span>
                    <PctCell v={c.p3} />
                    <PctCell v={c.p6} />
                    <PctCell v={c.p12} />
                  </div>
                ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PctCell({ v }: { v: Pt }) {
  const color =
    v.direction === "up" ? "text-emerald-600" : v.direction === "down" ? "text-red-600" : "text-muted-foreground";
  const txt = v.changePct == null ? "–" : `${v.changePct > 0 ? "+" : ""}${v.changePct}%`;
  return <span className={`text-right text-sm font-bold tabular-nums ${color}`}>{txt}</span>;
}
