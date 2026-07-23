"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { TrendingUp, ChevronDown, ChevronRight, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { setPersisted } from "@/lib/persist";

type Pt = { direction: "up" | "flat" | "down"; changePct: number | null };
type Row = { name: string; cid: string; p3: Pt; p6: Pt; p12: Pt; series: number[] };
type Sub = { keyword: string; total: number | null; comp: string | null };

/** 네이버쇼핑 대분류 상대 성과(전분야 평균 대비). 대분류 클릭 → 대표 세부키워드 검색량 펼침. */
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
          전년 동기 대비를 <b>전분야 평균과 비교</b>. 분야를 누르면 세부 키워드 검색량이 펼쳐져요.
        </p>
        {insight.isLoading && <p className="mt-2 text-sm text-muted-foreground">조회 중…</p>}
        {insight.error && (
          <p className="mt-2 text-xs text-muted-foreground">쇼핑인사이트 미연동 · NCP 키 확인</p>
        )}
        {insight.data && insight.data.length > 0 && (
          <div className="mt-2">
            <div className="grid grid-cols-[1.5rem_1fr_3rem_3rem_3rem] items-center gap-1 pb-1 text-[11px] font-medium text-muted-foreground">
              <span />
              <span>분야</span>
              <span className="text-right">3개월</span>
              <span className="text-right">6개월</span>
              <span className="text-right">12개월</span>
            </div>
            <div className="divide-y divide-border/40">
              {[...insight.data]
                .sort((a, b) => (b.p3.changePct ?? -999) - (a.p3.changePct ?? -999))
                .map((c) => (
                  <CategoryRow key={c.cid} c={c} />
                ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CategoryRow({ c }: { c: Row }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const sub = useQuery({
    queryKey: ["subtrend", c.cid],
    enabled: open,
    staleTime: 6 * 3600_000,
    retry: false,
    queryFn: async () => {
      const r = await fetch(`/api/subtrend?parent=${c.cid}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "조회 실패");
      return (j.items ?? []) as Sub[];
    },
  });

  const research = (kw: string) => {
    setPersisted("research.input", kw);
    setPersisted("research.query", kw);
    router.push("/research");
  };

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="grid w-full grid-cols-[1.5rem_1fr_3rem_3rem_3rem] items-center gap-1 py-2 text-left"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="truncate text-sm font-medium">{c.name}</span>
        <PctCell v={c.p3} />
        <PctCell v={c.p6} />
        <PctCell v={c.p12} />
      </button>

      {open && (
        <div className="mb-2 ml-6 space-y-0.5 rounded-lg bg-muted/50 p-2">
          {sub.isLoading && <p className="text-xs text-muted-foreground">검색량 조회 중…</p>}
          {sub.error && <p className="text-xs text-muted-foreground">검색량 미연동</p>}
          {sub.data?.map((s) => (
            <button
              key={s.keyword}
              onClick={() => research(s.keyword)}
              className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-sm hover:bg-background"
            >
              <span className="flex items-center gap-1 truncate">
                <Search className="h-3 w-3 text-muted-foreground" />
                {s.keyword}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                <b className="tabular-nums text-foreground">
                  {s.total != null ? s.total.toLocaleString("ko-KR") : "-"}
                </b>
                {s.comp && ` · ${s.comp}`}
              </span>
            </button>
          ))}
          {sub.data && sub.data.length === 0 && (
            <p className="text-xs text-muted-foreground">등록된 세부 키워드가 없어요.</p>
          )}
        </div>
      )}
    </div>
  );
}

function PctCell({ v }: { v: Pt }) {
  const color =
    v.direction === "up" ? "text-emerald-600" : v.direction === "down" ? "text-red-600" : "text-muted-foreground";
  const txt = v.changePct == null ? "–" : `${v.changePct > 0 ? "+" : ""}${v.changePct}%`;
  return <span className={`text-right text-sm font-bold tabular-nums ${color}`}>{txt}</span>;
}
