"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, TrendingUp, Store } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { won } from "@/lib/utils";

type KwRow = { keyword: string; pc: number; mobile: number; total: number; comp: string };
type Estimate = {
  reviewCount: number;
  confidence: "none" | "low" | "medium" | "high";
  estMonthlyLow: number | null;
  estMonthlyHigh: number | null;
  daysSpan: number;
  note: string;
};
type Item = {
  name: string | null;
  price: number | null;
  reviewCount: number | null;
  isRocket: boolean;
  isPb: boolean;
  rank: number | null;
  estimate: Estimate;
};
type Summary = {
  count: number;
  priceMin: number | null;
  priceMax: number | null;
  priceMedian: number | null;
  maxReview: number;
  pbCount: number;
  rocketCount: number;
  collections: number;
};

const CONF: Record<string, { label: string; variant: "outline" | "warn" | "caution" | "go" }> = {
  none: { label: "재수집필요", variant: "outline" },
  low: { label: "신뢰 낮음", variant: "warn" },
  medium: { label: "신뢰 중간", variant: "caution" },
  high: { label: "신뢰 높음", variant: "go" },
};

export default function ResearchPage() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");

  const naver = useQuery({
    queryKey: ["keyword", query],
    enabled: !!query,
    queryFn: async () => {
      const r = await fetch(`/api/keyword?q=${encodeURIComponent(query)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "조회 실패");
      return j as { keyword: string; rows: KwRow[] };
    },
  });

  const coupang = useQuery({
    queryKey: ["coupang-research", query],
    enabled: !!query,
    queryFn: async () => {
      const r = await fetch(`/api/coupang-research?keyword=${encodeURIComponent(query)}`);
      return r.ok ? ((await r.json()) as { items: Item[]; summary: Summary | null; collections: number }) : null;
    },
  });

  const exact = naver.data?.rows.find((r) => r.keyword.replace(/\s+/g, "") === query.replace(/\s+/g, "")) ?? naver.data?.rows[0];
  const related = (naver.data?.rows ?? []).filter((r) => r !== exact).slice(0, 20);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">상품 찾기</h1>
        <p className="text-sm text-muted-foreground">키워드 검색량(네이버) + 쿠팡 경쟁·판매량 추정</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(input.trim());
        }}
        className="flex gap-2"
      >
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="예: 순면 양말" />
        <Button type="submit" disabled={!input.trim()}>
          <Search className="h-4 w-4" /> 조회
        </Button>
      </form>

      {!query && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            키워드를 넣고 조회하세요. 쿠팡 경쟁 데이터는{" "}
            <Link href="/settings/coupang-bookmarklet" className="font-semibold text-primary underline">
              북마클릿
            </Link>
            으로 쿠팡 검색결과에서 수집합니다.
          </CardContent>
        </Card>
      )}

      {/* 네이버 검색량 */}
      {query && (
        <Card className="border-2 border-primary/20">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="font-bold">키워드 검색량</span>
              <span className="text-xs text-muted-foreground">네이버 월간</span>
            </div>
            {naver.isLoading && <p className="text-sm text-muted-foreground">조회 중…</p>}
            {naver.error && (
              <p className="text-sm text-destructive">
                {String((naver.error as Error).message)}
                <br />
                <span className="text-xs text-muted-foreground">
                  네이버 API 키(NAVER_API_KEY/SECRET/CUSTOMER_ID) 설정·재배포를 확인하세요.
                </span>
              </p>
            )}
            {exact && (
              <div className="flex items-end gap-3">
                <span className="text-3xl font-extrabold tabular-nums">{exact.total.toLocaleString("ko-KR")}</span>
                <span className="pb-1 text-sm text-muted-foreground">
                  PC {exact.pc.toLocaleString("ko-KR")} · 모바일 {exact.mobile.toLocaleString("ko-KR")}
                </span>
                <Badge variant="outline" className="mb-1 ml-auto">
                  경쟁 {exact.comp}
                </Badge>
              </div>
            )}
            {related.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">연관 키워드</p>
                <div className="space-y-1">
                  {related.map((r) => (
                    <button
                      key={r.keyword}
                      onClick={() => {
                        setInput(r.keyword);
                        setQuery(r.keyword);
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm hover:bg-accent"
                    >
                      <span className="truncate">{r.keyword}</span>
                      <span className="shrink-0 text-muted-foreground">
                        <b className="tabular-nums text-foreground">{r.total.toLocaleString("ko-KR")}</b> · {r.comp}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 쿠팡 경쟁분석 */}
      {query && (
        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <Store className="h-4 w-4 text-primary" />
              <span className="font-bold">쿠팡 경쟁</span>
              {coupang.data?.summary && (
                <span className="text-xs text-muted-foreground">{coupang.data.summary.collections}회 수집</span>
              )}
            </div>

            {!coupang.data?.summary ? (
              <div className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
                수집된 데이터가 없어요.{" "}
                <Link href="/settings/coupang-bookmarklet" className="font-semibold text-primary underline">
                  북마클릿
                </Link>
                으로 쿠팡에서 &quot;{query}&quot; 검색 후 수집하세요.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <Line label="상품 수" value={`${coupang.data.summary.count}개`} />
                  <Line label="최다 리뷰" value={coupang.data.summary.maxReview.toLocaleString("ko-KR")} />
                  <Line label="가격대" value={`${won(coupang.data.summary.priceMin)}~${won(coupang.data.summary.priceMax)}`} />
                  <Line label="PB / 로켓" value={`${coupang.data.summary.pbCount} / ${coupang.data.summary.rocketCount}`} />
                </div>
                {coupang.data.summary.pbCount > 0 && (
                  <p className="mt-2 rounded-lg bg-nogo/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                    🔴 쿠팡 PB 상품 {coupang.data.summary.pbCount}개 — 가격경쟁 불리 구역
                  </p>
                )}
                {coupang.data.summary.collections < 2 && (
                  <p className="mt-2 rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn-foreground">
                    판매량 추정은 <b>2회 이상 수집</b>이 필요해요. 3~7일 뒤 한 번 더 수집하세요.
                  </p>
                )}

                <div className="mt-3 space-y-2">
                  {coupang.data.items.slice(0, 15).map((it, i) => (
                    <div key={i} className="rounded-xl border border-border/60 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm font-medium">
                          <span className="text-muted-foreground">{it.rank ?? i + 1}. </span>
                          {it.name}
                        </p>
                        <div className="flex shrink-0 gap-1">
                          {it.isPb && <Badge variant="nogo">PB</Badge>}
                          {it.isRocket && <Badge variant="secondary">로켓</Badge>}
                        </div>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {won(it.price)} · 리뷰 {(it.reviewCount ?? 0).toLocaleString("ko-KR")}
                        </span>
                        <span className="flex items-center gap-1">
                          {it.estimate.confidence === "none" ? (
                            <Badge variant="outline">판매량 재수집필요</Badge>
                          ) : (
                            <>
                              <span className="font-semibold text-foreground">
                                월 ~{(it.estimate.estMonthlyLow ?? 0).toLocaleString("ko-KR")}–
                                {(it.estimate.estMonthlyHigh ?? 0).toLocaleString("ko-KR")}개
                              </span>
                              <Badge variant={CONF[it.estimate.confidence].variant}>
                                {CONF[it.estimate.confidence].label}
                              </Badge>
                            </>
                          )}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
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
