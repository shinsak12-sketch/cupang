"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, DatabaseZap, TrendingUp, CircleDot, Target, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CategoryTrend } from "@/components/category-trend";
import { won } from "@/lib/utils";

type Stats = {
  ym: string;
  candidate: number;
  selling: number;
  discarded: number;
  categories: number;
  promo: { name: string; myStartDate: string | null; daysRemaining: number | null } | null;
  sales: { thisMonthQty: number; thisMonthMargin: number; totalQty: number; totalMargin: number };
};

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["stats"],
    queryFn: async (): Promise<Stats> => {
      const r = await fetch("/api/stats");
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const needsSetup = !!error || (data && data.categories === 0);

  // 이번 달 목표 마진 (기기 로컬 저장)
  const [goal, setGoal] = useState(0);
  const [editing, setEditing] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  useEffect(() => {
    const g = Number(localStorage.getItem("cupang.monthlyGoal") || "0");
    setGoal(g);
  }, []);
  const saveGoal = () => {
    const g = Number(goalInput.replace(/[,\s]/g, "")) || 0;
    localStorage.setItem("cupang.monthlyGoal", String(g));
    setGoal(g);
    setEditing(false);
  };
  const current = data?.sales.thisMonthMargin ?? 0;
  const progress = goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">대시보드</h1>
        <Button asChild size="sm">
          <Link href="/calc">
            <Plus className="h-4 w-4" /> 계산
          </Link>
        </Button>
      </div>

      {needsSetup && (
        <Card className="border-2 border-primary/30 bg-accent">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <DatabaseZap className="h-5 w-5 text-primary" />
              <p className="font-bold">먼저 DB 셋업 (1분)</p>
            </div>
            <p className="text-sm text-muted-foreground">
              {error ? "DB 연결/셋업이 필요합니다." : "기초 데이터가 비어 있어요."} 버튼 한 번이면 됩니다.
            </p>
            <Button asChild className="w-full">
              <Link href="/settings/setup">
                <DatabaseZap className="h-4 w-4" /> DB 셋업 실행
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 이번 달 목표 */}
      <Card className="border-2 border-primary/30 bg-gradient-to-br from-accent to-transparent shadow-pop">
        <CardContent className="p-5">
          <div className="mb-2 flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <span className="font-bold">이번 달 목표</span>
            {goal > 0 && !editing && (
              <button
                onClick={() => {
                  setGoalInput(String(goal));
                  setEditing(true);
                }}
                className="ml-auto text-muted-foreground"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
          </div>

          {goal <= 0 || editing ? (
            <div className="flex items-center gap-2">
              <Input
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                inputMode="numeric"
                placeholder="목표 마진 (원)"
                autoFocus
              />
              <Button size="sm" onClick={saveGoal}>
                저장
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-end justify-between">
                <span className="text-2xl font-extrabold tabular-nums">{won(current)}</span>
                <span className="pb-0.5 text-sm text-muted-foreground">
                  / {won(goal)} · <b className="text-foreground">{progress}%</b>
                </span>
              </div>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${progress >= 100 ? "bg-emerald-500" : "bg-primary"}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {current >= goal ? "🎉 목표 달성!" : `목표까지 ${won(goal - current)} 남음`}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* 판매 현황 */}
      <Card className="border-2 border-primary/20 shadow-pop">
        <CardContent className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="font-bold">판매 현황</span>
            <span className="text-xs text-muted-foreground">({data?.ym ?? "이번 달"})</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Metric label="이번 달 마진" value={won(data?.sales.thisMonthMargin)} big loading={isLoading} />
            <Metric label="이번 달 판매" value={`${(data?.sales.thisMonthQty ?? 0).toLocaleString("ko-KR")}개`} loading={isLoading} />
            <Metric label="누적 마진" value={won(data?.sales.totalMargin)} loading={isLoading} />
            <Metric label="누적 판매" value={`${(data?.sales.totalQty ?? 0).toLocaleString("ko-KR")}개`} loading={isLoading} />
          </div>
          <Button asChild variant="outline" size="sm" className="mt-4 w-full">
            <Link href="/manage">월별 판매 입력 →</Link>
          </Button>
        </CardContent>
      </Card>

      {/* 상태 요약 */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="후보" value={data?.candidate ?? 0} tone="primary" href="/products" />
        <StatTile label="판매중" value={data?.selling ?? 0} tone="go" href="/manage" />
        <StatTile label="폐기" value={data?.discarded ?? 0} tone="muted" href="/products" />
      </div>

      {/* 분야 트렌드 (매일 안 바뀌어 홈에 상주) */}
      <CategoryTrend />

      {/* 프로모션 D-day */}
      {data?.promo && (
        <Card className="border-warn/40">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-warn/15 text-warn-foreground">
              <CircleDot className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{data.promo.name}</p>
              <p className="text-sm text-muted-foreground">
                {data.promo.myStartDate ? "종료 후 마진 절벽 주의" : "시작일 넣으면 D-day 계산"}
              </p>
            </div>
            {data.promo.daysRemaining !== null ? (
              <Badge variant={data.promo.daysRemaining <= 14 ? "nogo" : "warn"} className="text-sm">D-{data.promo.daysRemaining}</Badge>
            ) : (
              <Button asChild size="sm" variant="outline"><Link href="/settings/promotions">입력</Link></Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Metric({ label, value, big, loading }: { label: string; value: string; big?: boolean; loading?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-extrabold tabular-nums ${big ? "text-2xl" : "text-xl"} ${loading ? "opacity-40" : ""}`}>
        {loading ? "…" : value}
      </p>
    </div>
  );
}

function StatTile({ label, value, tone, href }: { label: string; value: number; tone: "primary" | "go" | "muted"; href: string }) {
  const color = tone === "primary" ? "text-primary" : tone === "go" ? "text-emerald-600" : "text-muted-foreground";
  return (
    <Link href={href}>
      <Card className="transition-all active:scale-[0.98]">
        <CardContent className="p-4 text-center">
          <p className={`text-3xl font-extrabold tabular-nums ${color}`}>{value}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
