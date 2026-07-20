"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Fx = {
  rate: number | null;
  kind: string | null;
  base: number | null;
  cashSelling?: number | null;
  date: string | null;
  source: string;
};

export default function FxPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["fx", "latest"],
    queryFn: async () => {
      const r = await fetch("/api/fx/latest");
      return r.ok ? ((await r.json()) as Fx) : null;
    },
    staleTime: 3600_000,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">환율 (CNY→KRW)</h1>
        <p className="text-sm text-muted-foreground">마진 계산에 자동으로 쓰이는 위안 환율입니다.</p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">불러오는 중…</p>}

      <Card className="border-2 border-primary/30 shadow-pop">
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">현찰 살 때 (1위안)</span>
            <Badge variant={data?.rate ? "go" : "warn"}>{data?.source === "dunamu" ? "하나은행" : data?.source ?? "-"}</Badge>
          </div>
          <p className="text-4xl font-extrabold tabular-nums">
            {data?.rate ? `${data.rate}원` : "—"}
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {data?.base != null && <Row label="매매기준율" value={`${data.base}원`} />}
            {data?.cashSelling != null && <Row label="현찰 팔 때" value={`${data.cashSelling}원`} />}
            {data?.date && <Row label="기준일" value={data.date} />}
          </div>
          {!data?.rate && (
            <p className="rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn-foreground">
              환율 조회 실패 시 계산기에서 기본값(190)이 쓰이며, 직접 입력할 수 있습니다.
            </p>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        계산기의 사입원가 = (원가¥ + 내륙운송비¥) × (환율 + 대행가산). 여기 환율이 현찰 살 때 기준으로 자동 반영됩니다.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-1 whitespace-nowrap">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
