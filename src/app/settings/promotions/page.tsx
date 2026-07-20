"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type Promo = {
  id: number;
  promoKey: string;
  name: string;
  capDays: number | null;
  capAmount: string | null;
  myStartDate: string | null;
  note: string | null;
};

export default function PromotionsPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["promotions"],
    queryFn: async () => {
      const r = await fetch("/api/promotions");
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<{ rows: Promo[] }>;
    },
  });

  const setDate = useMutation({
    mutationFn: (v: { id: number; myStartDate: string | null }) =>
      fetch("/api/promotions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["promotions"] }),
  });

  function dday(p: Promo): number | null {
    if (!p.myStartDate || p.capDays == null) return null;
    const elapsed = Math.floor((Date.now() - Date.parse(p.myStartDate + "T00:00:00Z")) / 86_400_000);
    return p.capDays - elapsed;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">프로모션</h1>
        <p className="text-sm text-muted-foreground">내 시작일을 넣으면 D-day와 종료일이 계산돼요.</p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">불러오는 중…</p>}
      {error && <p className="text-sm text-destructive">DB 셋업 필요: {String(error)}</p>}

      <div className="space-y-3">
        {(data?.rows ?? []).map((p) => {
          const d = dday(p);
          return (
            <Card key={p.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold">{p.name}</p>
                  {d !== null && <Badge variant={d <= 14 ? "nogo" : "warn"}>D-{d}</Badge>}
                </div>
                {p.note && <p className="text-xs text-muted-foreground">{p.note}</p>}
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">내 시작일 (첫 판매 개시일)</span>
                  <Input
                    type="date"
                    value={p.myStartDate ?? ""}
                    onChange={(e) => setDate.mutate({ id: p.id, myStartDate: e.target.value || null })}
                  />
                </label>
                {p.capDays != null && (
                  <p className="text-xs text-muted-foreground">
                    최대 {p.capDays}일{p.capAmount ? ` 또는 누적매출 ${Number(p.capAmount).toLocaleString("ko-KR")}원` : ""}까지
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
