"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { won, pct } from "@/lib/utils";

type Row = {
  id: number;
  name: string;
  sizeType: string | null;
  price: number;
  priceSource: string;
  marginRate: number;
  netProfit: number;
  roi: number;
  breakevenQty: number;
  verdict: "GO" | "CAUTION" | "NO-GO";
  recoveryDays: number | null;
  annualizedRoi: number | null;
};

type SortKey = "annualizedRoi" | "marginRate" | "netProfit" | "roi" | "recoveryDays" | "breakevenQty";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "annualizedRoi", label: "연환산 ROI (기본)" },
  { key: "roi", label: "ROI" },
  { key: "marginRate", label: "마진율" },
  { key: "netProfit", label: "개당이익" },
  { key: "recoveryDays", label: "현금회수일" },
  { key: "breakevenQty", label: "BEP수량" },
];

export default function ComparePage() {
  const [sort, setSort] = useState<SortKey>("annualizedRoi");
  const { data, isLoading, error } = useQuery({
    queryKey: ["compare"],
    queryFn: async () => {
      const r = await fetch("/api/compare");
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<{ rows: Row[] }>;
    },
  });

  const rows = [...(data?.rows ?? [])].sort((a, b) => {
    const av = a[sort];
    const bv = b[sort];
    const an = av === null ? (sort === "recoveryDays" || sort === "breakevenQty" ? Infinity : -Infinity) : av;
    const bn = bv === null ? (sort === "recoveryDays" || sort === "breakevenQty" ? Infinity : -Infinity) : bv;
    // recoveryDays/BEP는 작을수록 좋음(오름차순), 나머지는 클수록 좋음(내림차순)
    return sort === "recoveryDays" || sort === "breakevenQty" ? an - bn : bn - an;
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">SKU 비교 랭킹</h1>
        <p className="text-sm text-muted-foreground">
          🔴 <b>ROI × 회전율 = 연환산 자본수익률</b>이 진짜 순위. 종료 후(프로모션 off) 경제성 기준.
          회전율은 로트 캐시플로우가 있어야 계산됩니다.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {SORTS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSort(s.key)}
            className={`rounded-md border px-3 py-1 text-sm ${
              sort === s.key ? "bg-primary text-primary-foreground" : "hover:bg-accent"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">계산 중…</p>}
      {error && <p className="text-sm text-destructive">DB 연결 필요: {String(error)}</p>}

      {data && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>판정</TableHead>
              <TableHead>사이즈</TableHead>
              <TableHead className="text-right">기준가</TableHead>
              <TableHead className="text-right">마진율</TableHead>
              <TableHead className="text-right">개당이익</TableHead>
              <TableHead className="text-right">ROI</TableHead>
              <TableHead className="text-right">회수일</TableHead>
              <TableHead className="text-right">연환산ROI</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  <Link href={`/products/${r.id}`} className="hover:underline">
                    {r.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={r.verdict === "GO" ? "go" : r.verdict === "CAUTION" ? "caution" : "nogo"}>
                    {r.verdict}
                  </Badge>
                </TableCell>
                <TableCell>{r.sizeType ?? "-"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {won(r.price)}
                  {r.priceSource === "default" && (
                    <span className="ml-1 text-xs text-warn">(기본)</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{pct(r.marginRate)}</TableCell>
                <TableCell className="text-right tabular-nums">{won(r.netProfit)}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(r.roi)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.recoveryDays === null ? "—" : `D+${r.recoveryDays}`}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {r.annualizedRoi === null ? (
                    <span className="text-xs text-muted-foreground">로트 필요</span>
                  ) : (
                    pct(r.annualizedRoi)
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
