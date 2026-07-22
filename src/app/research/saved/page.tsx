"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Calculator, Search, Trash2, ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSaved } from "@/lib/saved";
import { setPersisted } from "@/lib/persist";

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

export default function SavedListPage() {
  const router = useRouter();
  const { items: saved, remove } = useSaved();
  const [vols, setVols] = useState<Record<string, { total: number; comp: string }>>({});
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");

  async function refresh() {
    if (!saved.length) return;
    setLoading(true);
    setNote("");
    try {
      const r = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: saved.map((s) => s.keyword) }),
      });
      const j = (await r.json()) as {
        volumes?: Record<string, { total: number; comp: string }>;
        note?: string;
      };
      const raw = j.volumes ?? {};
      const byNorm = new Map(Object.entries(raw).map(([k, v]) => [norm(k), v]));
      const map: Record<string, { total: number; comp: string }> = {};
      for (const s of saved) {
        const v = byNorm.get(norm(s.keyword));
        if (v) map[s.keyword] = v;
      }
      setVols(map);
      setNote(j.note ?? "");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }

  const goResearch = (kw: string) => {
    setPersisted("research.input", kw);
    setPersisted("research.query", kw);
    router.push("/research");
  };

  const rows = saved
    .map((s) => ({
      ...s,
      vol: vols[s.keyword]?.total ?? s.monthlyVolume ?? null,
      compv: vols[s.keyword]?.comp ?? s.comp ?? null,
    }))
    .sort((a, b) => (b.vol ?? -1) - (a.vol ?? -1));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/research" className="text-muted-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-extrabold tracking-tight">저장 리스트</h1>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">저장한 후보 {saved.length}개 · 검색량 순</p>
        </div>
        <Button size="sm" onClick={refresh} disabled={loading || !saved.length}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "조회 중" : "검색량 갱신"}
        </Button>
      </div>

      {note && <p className="text-xs text-muted-foreground">{note}</p>}

      {saved.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            저장한 상품이 없어요.{" "}
            <Link href="/research" className="font-semibold text-primary underline">
              상품 찾기
            </Link>
            에서 발굴 결과의 <b>저장</b> 버튼을 눌러 담아두세요.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.keyword}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 font-bold">{r.keyword}</span>
                  <div className="flex shrink-0 gap-1">
                    {r.margin && (
                      <Badge variant={r.margin === "상" ? "go" : r.margin === "중" ? "caution" : "nogo"}>
                        마진 {r.margin}
                      </Badge>
                    )}
                    {r.verdict && (
                      <Badge variant={r.verdict === "GOOD" ? "go" : r.verdict === "AVOID" ? "nogo" : "caution"}>
                        {r.verdict === "GOOD" ? "추천" : r.verdict === "AVOID" ? "비추천" : "검토"}
                      </Badge>
                    )}
                  </div>
                </div>
                {r.reason && <p className="mt-1 text-sm text-muted-foreground">{r.reason}</p>}
                <p className="mt-1.5 text-xs text-muted-foreground">
                  월검색량{" "}
                  <b className="tabular-nums text-foreground">
                    {r.vol != null ? r.vol.toLocaleString("ko-KR") : "미상"}
                  </b>
                  {r.compv && ` · 경쟁 ${r.compv}`}
                </p>

                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  <MiniBtn onClick={() => goResearch(r.keyword)} icon={Search} label="키워드조사" />
                  <MiniBtn
                    onClick={() => router.push(`/calc?name=${encodeURIComponent(r.keyword)}`)}
                    icon={Calculator}
                    label="마진계산"
                  />
                  <MiniBtn onClick={() => remove(r.keyword)} icon={Trash2} label="삭제" danger />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniBtn({
  onClick,
  icon: Icon,
  label,
  danger,
}: {
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 rounded-lg border py-1.5 text-[11px] font-semibold transition-all active:scale-95 ${
        danger
          ? "border-border/60 text-muted-foreground hover:bg-nogo/10 hover:text-red-600"
          : "border-border/60 text-muted-foreground hover:bg-accent"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
