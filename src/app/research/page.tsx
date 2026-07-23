"use client";

import Link from "next/link";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  Store,
  Sparkles,
  Upload,
  Copy,
  Check,
  Calculator,
  Bookmark,
  BookmarkCheck,
  ListChecks,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { won, cn } from "@/lib/utils";
import { usePersistentState } from "@/lib/persist";
import { useSaved } from "@/lib/saved";

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

type Reco = {
  keyword: string;
  verdict: "GOOD" | "OKAY" | "AVOID";
  margin: "상" | "중" | "하" | null;
  reason: string;
  caution: string;
  monthlyVolume: number | null;
  comp: string | null;
};
type DiscoverResult = { ask: string; recommendations: Reco[]; note: string };

const VERDICT: Record<string, { label: string; variant: "go" | "caution" | "nogo"; ring: string }> = {
  GOOD: { label: "추천", variant: "go", ring: "border-emerald-400/50 bg-emerald-50/50 dark:bg-emerald-950/20" },
  OKAY: { label: "검토", variant: "caution", ring: "border-amber-400/40" },
  AVOID: { label: "비추천", variant: "nogo", ring: "border-red-300/40 opacity-80" },
};

export default function ResearchPage() {
  const router = useRouter();
  const [input, setInput] = usePersistentState("research.input", "");
  const [query, setQuery] = usePersistentState("research.query", "");
  const [ask, setAsk] = usePersistentState("research.ask", "");
  const [aiResult, setAiResult] = usePersistentState<DiscoverResult | null>("research.ai", null);
  const [uploaded, setUploaded] = usePersistentState<{ recommendations: Reco[]; note: string } | null>(
    "research.uploaded",
    null
  );
  const [fileErr, setFileErr] = useState("");
  const [enriching, setEnriching] = useState(false);

  const { items: saved, toggle } = useSaved();
  const savedSet = new Set(saved.map((s) => s.keyword));

  const discover = useMutation({
    mutationFn: async (askText: string): Promise<DiscoverResult> => {
      const r = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ask: askText }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "발굴 실패");
      return j as DiscoverResult;
    },
    onSuccess: (d) => setAiResult(d),
  });

  const resultsRef = useRef<HTMLDivElement>(null);

  const runKeyword = (kw: string) => {
    setInput(kw);
    setQuery(kw);
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };
  const goCalc = (r: Reco) => {
    router.push(`/calc?name=${encodeURIComponent(r.keyword)}`);
  };
  const saveItem = (r: Reco) => {
    toggle({
      keyword: r.keyword,
      verdict: r.verdict,
      margin: r.margin,
      reason: r.reason,
      caution: r.caution,
      monthlyVolume: r.monthlyVolume,
      comp: r.comp,
    });
  };

  async function onFile(file: File) {
    setFileErr("");
    try {
      const text = await file.text();
      const recos = parseRecos(text);
      if (recos.length === 0) throw new Error("파일에서 상품(keyword)을 찾지 못했어요.");

      // 네이버 검색량 보강 (무료). 이미 값이 있으면 유지.
      setEnriching(true);
      let note = "업로드한 발굴 결과 (Claude 채팅으로 생성).";
      try {
        const need = recos.filter((r) => r.monthlyVolume == null).map((r) => r.keyword);
        if (need.length) {
          const r = await fetch("/api/enrich", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ keywords: need }),
          });
          const j = (await r.json()) as {
            volumes?: Record<string, { total: number; comp: string }>;
            note?: string;
          };
          const vols = j.volumes ?? {};
          const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
          const byNorm = new Map(Object.entries(vols).map(([k, v]) => [norm(k), v]));
          for (const rec of recos) {
            if (rec.monthlyVolume == null) {
              const v = byNorm.get(norm(rec.keyword));
              if (v) {
                rec.monthlyVolume = v.total;
                rec.comp = rec.comp ?? v.comp;
              }
            }
          }
          if (j.note) note += ` ${j.note}`;
        }
      } catch {
        // 검색량 없이도 표시
      } finally {
        setEnriching(false);
      }
      setUploaded({ recommendations: recos, note });
    } catch (e) {
      setEnriching(false);
      setFileErr(e instanceof Error ? e.message : "파일을 읽지 못했어요.");
    }
  }

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

  const trend = useQuery({
    queryKey: ["trend", query],
    enabled: !!query,
    staleTime: 3600_000,
    retry: false,
    queryFn: async () => {
      const r = await fetch(`/api/trend?q=${encodeURIComponent(query)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "트렌드 조회 실패");
      return j as { direction: "up" | "flat" | "down"; changePct: number | null; series: number[] };
    },
  });

  const exact = naver.data?.rows.find((r) => r.keyword.replace(/\s+/g, "") === query.replace(/\s+/g, "")) ?? naver.data?.rows[0];
  const related = (naver.data?.rows ?? []).filter((r) => r !== exact).slice(0, 20);

  const cardProps = { onPick: runKeyword, onCalc: goCalc, onSave: saveItem, savedSet };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">상품 찾기</h1>
          <p className="text-sm text-muted-foreground">키워드 검색량(네이버) + 쿠팡 경쟁·판매량 추정</p>
        </div>
        <Button asChild size="sm" variant="outline" className="shrink-0">
          <Link href="/research/saved">
            <ListChecks className="h-4 w-4" /> 저장{saved.length ? ` ${saved.length}` : ""}
          </Link>
        </Button>
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

      {/* AI 상품 발굴 (Claude) */}
      <Card className="border-2 border-primary/30 bg-gradient-to-br from-accent to-transparent shadow-pop">
        <CardContent className="p-5">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-bold">AI 상품 발굴</span>
            <span className="text-xs text-muted-foreground">Claude가 상품군을 찾아줍니다</span>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            원하는 조건을 자유롭게 적으세요. (비워두면 일반 추천)
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              discover.mutate(ask.trim());
            }}
            className="space-y-2"
          >
            <Input
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              placeholder="예: 겨울철 캠핑 소품, 저단가 말고 객단가 1만원 이상"
            />
            <Button type="submit" className="w-full" disabled={discover.isPending}>
              <Sparkles className="h-4 w-4" />
              {discover.isPending ? "Claude가 찾는 중… (5~15초)" : "AI로 상품군 발굴 (유료 API)"}
            </Button>
          </form>

          {/* 무료: Claude 채팅으로 만든 파일 업로드 */}
          <div className="mt-3 rounded-xl border border-dashed border-primary/40 p-3">
            <p className="text-xs font-semibold">💰 무료: 파일로 올리기</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Claude 채팅에 &quot;상품 찾아서 발굴 파일 만들어줘&quot;라고 한 뒤, 받은 JSON 파일을 올리면
              검색량까지 붙여서 아래처럼 보여줘요. (API 비용 0원)
            </p>
            <label className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm font-semibold hover:bg-accent">
              <Upload className="h-4 w-4" />
              {enriching ? "검색량 붙이는 중…" : "발굴 파일 업로드 (.json)"}
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                  e.target.value = "";
                }}
              />
            </label>
            {fileErr && <p className="mt-2 text-xs text-destructive">{fileErr}</p>}
          </div>

          {discover.error && (
            <p className="mt-3 text-sm text-destructive">
              {String((discover.error as Error).message)}
              <br />
              <span className="text-xs text-muted-foreground">
                Vercel 환경변수 ANTHROPIC_API_KEY 설정·재배포를 확인하세요.
              </span>
            </p>
          )}

          {uploaded && <RecoList data={uploaded} {...cardProps} />}
          {aiResult && <RecoList data={aiResult} {...cardProps} />}
        </CardContent>
      </Card>

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

      {/* 조회 결과 스크롤 앵커 */}
      <div ref={resultsRef} className="scroll-mt-4" />

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
            {trend.isLoading && <p className="mt-2 text-xs text-muted-foreground">트렌드 조회 중…</p>}
            {trend.error && (
              <p className="mt-2 text-xs text-muted-foreground">트렌드 미연동 · 네이버 데이터랩 이용신청 후 자동 표시</p>
            )}
            {trend.data && trend.data.series.length > 3 && (
              <div className="mt-2 flex items-center gap-2">
                <TrendBadge dir={trend.data.direction} pct={trend.data.changePct} />
                <Sparkline data={trend.data.series} dir={trend.data.direction} />
                <span className="text-xs text-muted-foreground">최근 12개월</span>
              </div>
            )}
            {trend.data && trend.data.series.length <= 3 && (
              <p className="mt-2 text-xs text-muted-foreground">이 키워드는 데이터랩 추세 데이터가 부족해요.</p>
            )}
            {related.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">연관 키워드</p>
                <div className="space-y-1">
                  {related.map((r) => (
                    <button
                      key={r.keyword}
                      onClick={() => runKeyword(r.keyword)}
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

/** 업로드 파일 → Reco[] 정규화. 여러 형태 허용:
 *  - ["키워드1","키워드2"]
 *  - [{keyword, verdict, margin, reason, caution, monthlyVolume, comp}]
 *  - {recommendations:[...]}
 */
function parseRecos(text: string): Reco[] {
  const data = JSON.parse(text);
  const arr: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { recommendations?: unknown[] })?.recommendations)
      ? (data as { recommendations: unknown[] }).recommendations
      : [];

  const okVerdict = (v: unknown): Reco["verdict"] =>
    v === "GOOD" || v === "OKAY" || v === "AVOID" ? v : "OKAY";

  const okMargin = (m: unknown): Reco["margin"] => (m === "상" || m === "중" || m === "하" ? m : null);

  const out: Reco[] = [];
  for (const item of arr) {
    if (typeof item === "string") {
      if (item.trim()) out.push({ keyword: item.trim(), verdict: "OKAY", margin: null, reason: "", caution: "", monthlyVolume: null, comp: null });
      continue;
    }
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const kw = typeof o.keyword === "string" ? o.keyword.trim() : "";
      if (!kw) continue;
      out.push({
        keyword: kw,
        verdict: okVerdict(o.verdict),
        margin: okMargin(o.margin),
        reason: typeof o.reason === "string" ? o.reason : "",
        caution: typeof o.caution === "string" ? o.caution : "",
        monthlyVolume: typeof o.monthlyVolume === "number" ? o.monthlyVolume : null,
        comp: typeof o.comp === "string" ? o.comp : null,
      });
    }
  }
  return out;
}

type CardProps = {
  onPick: (kw: string) => void;
  onCalc: (r: Reco) => void;
  onSave: (r: Reco) => void;
  savedSet: Set<string>;
};

function RecoList({ data, ...actions }: { data: { recommendations: Reco[]; note: string } } & CardProps) {
  return (
    <div className="mt-4 space-y-2">
      {data.recommendations.map((r, i) => (
        <RecoCard key={i} r={r} isSaved={actions.savedSet.has(r.keyword)} {...actions} />
      ))}
      <p className="pt-1 text-xs text-muted-foreground">{data.note}</p>
    </div>
  );
}

function RecoCard({ r, onPick, onCalc, onSave, isSaved }: { r: Reco; isSaved: boolean } & CardProps) {
  const v = VERDICT[r.verdict] ?? VERDICT.OKAY;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(r.keyword);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* 클립보드 미지원 무시 */
    }
  };

  return (
    <div className={`rounded-xl border p-3 ${v.ring}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 font-bold">{r.keyword}</span>
        <div className="flex shrink-0 gap-1">
          {r.margin && (
            <Badge variant={r.margin === "상" ? "go" : r.margin === "중" ? "caution" : "nogo"}>마진 {r.margin}</Badge>
          )}
          <Badge variant={v.variant}>{v.label}</Badge>
        </div>
      </div>
      {r.reason && <p className="mt-1 text-sm">{r.reason}</p>}
      {r.caution && <p className="mt-1 text-xs text-muted-foreground">⚠ {r.caution}</p>}
      <p className="mt-1.5 text-xs text-muted-foreground">
        월검색량{" "}
        <b className="tabular-nums text-foreground">
          {r.monthlyVolume != null ? r.monthlyVolume.toLocaleString("ko-KR") : "미상"}
        </b>
        {r.comp && ` · 경쟁 ${r.comp}`}
      </p>

      <div className="mt-2 grid grid-cols-4 gap-1.5">
        <ActBtn onClick={copy} icon={copied ? Check : Copy} label={copied ? "복사됨" : "이름복사"} active={copied} />
        <ActBtn onClick={() => onPick(r.keyword)} icon={Search} label="키워드조사" />
        <ActBtn onClick={() => onCalc(r)} icon={Calculator} label="마진계산" />
        <ActBtn
          onClick={() => onSave(r)}
          icon={isSaved ? BookmarkCheck : Bookmark}
          label={isSaved ? "저장됨" : "저장"}
          active={isSaved}
        />
      </div>
    </div>
  );
}

function ActBtn({
  onClick,
  icon: Icon,
  label,
  active,
}: {
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-0.5 rounded-lg border py-1.5 text-[11px] font-semibold transition-all active:scale-95",
        active ? "border-primary bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:bg-accent"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function TrendBadge({ dir, pct }: { dir: "up" | "flat" | "down"; pct: number | null }) {
  if (dir === "up")
    return (
      <Badge variant="go" className="gap-1">
        <TrendingUp className="h-3.5 w-3.5" /> 상승{pct != null ? ` +${pct}%` : ""}
      </Badge>
    );
  if (dir === "down")
    return (
      <Badge variant="nogo" className="gap-1">
        <TrendingDown className="h-3.5 w-3.5" /> 하락{pct != null ? ` ${pct}%` : ""}
      </Badge>
    );
  return (
    <Badge variant="outline" className="gap-1">
      <Minus className="h-3.5 w-3.5" /> 보합
    </Badge>
  );
}

function Sparkline({ data, dir }: { data: number[]; dir: "up" | "flat" | "down" }) {
  const w = 72;
  const h = 22;
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const span = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const stroke = dir === "up" ? "#059669" : dir === "down" ? "#dc2626" : "#94a3b8";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden>
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
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
