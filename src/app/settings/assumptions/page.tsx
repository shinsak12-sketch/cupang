"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Assumption = {
  id: number;
  categoryMajor: string | null;
  scenario: "optimistic" | "base" | "pessimistic";
  returnRate: string | null;
  defectRate: string | null;
  sellThroughRate: string | null;
  targetRoas: number | null;
  avgStorageDays: number | null;
};

const SCEN: Record<string, { label: string; variant: "go" | "secondary" | "nogo" }> = {
  optimistic: { label: "낙관", variant: "go" },
  base: { label: "기준", variant: "secondary" },
  pessimistic: { label: "비관", variant: "nogo" },
};

export default function AssumptionsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["assumptions"],
    queryFn: async () => {
      const r = await fetch("/api/assumptions");
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<{ rows: Assumption[] }>;
    },
  });

  // 카테고리별 그룹
  const groups = new Map<string, Assumption[]>();
  for (const a of data?.rows ?? []) {
    const key = a.categoryMajor ?? "_기본값";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }
  const order = ["optimistic", "base", "pessimistic"];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">가정값</h1>
        <p className="text-sm text-muted-foreground">
          반품률·소진율·ROAS·보관일 <Badge variant="warn" className="ml-1">전부 추정</Badge> — 실적 쌓이면 교정.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">불러오는 중…</p>}
      {error && <p className="text-sm text-destructive">DB 셋업 필요: {String(error)}</p>}

      <div className="space-y-3">
        {[...groups.entries()].map(([cat, rows]) => (
          <Card key={cat}>
            <CardContent className="p-4">
              <p className="mb-2 font-bold">{cat === "_기본값" ? "기본값 (카테고리 미지정)" : cat}</p>
              <div className="space-y-1.5">
                {rows
                  .sort((a, b) => order.indexOf(a.scenario) - order.indexOf(b.scenario))
                  .map((a) => (
                    <div key={a.id} className="flex items-center gap-2 text-sm">
                      <Badge variant={SCEN[a.scenario].variant} className="w-12 justify-center">
                        {SCEN[a.scenario].label}
                      </Badge>
                      <span className="flex-1 text-muted-foreground">
                        반품 {a.returnRate ?? "-"}% · 소진 {a.sellThroughRate ?? "-"}% · ROAS {a.targetRoas ?? "-"} · 보관 {a.avgStorageDays ?? "-"}일
                      </span>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
