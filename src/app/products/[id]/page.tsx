"use client";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, CheckCircle2, Trash2, RotateCcw, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { won, pct } from "@/lib/utils";

type Detail = {
  product: { id: number; name: string; status: string; sourceUrl: string | null };
  category: { major: string; middle: string | null } | null;
  salePrice: number | null;
  snapshot: {
    inputs?: Record<string, unknown>;
    result?: {
      landedCost: number;
      commission: number;
      inboundShipFee: number;
      vatPayable: number;
      margin: number;
      marginAfterAd: number;
      marginRateAfterAd: number;
      breakevenRoas: number;
      verdict: "양호" | "주의" | "위험";
    };
  } | null;
};

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["product", id],
    queryFn: async (): Promise<Detail> => {
      const r = await fetch(`/api/products/${id}`);
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const setStatus = useMutation({
    mutationFn: (status: string) =>
      fetch(`/api/products/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product", id] }),
  });

  const del = useMutation({
    mutationFn: () => fetch(`/api/products/${id}`, { method: "DELETE" }),
    onSuccess: () => router.push("/products"),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">불러오는 중…</p>;
  if (error || !data) return <p className="text-sm text-destructive">불러오기 실패: {String(error)}</p>;

  const { product, category } = data;
  const r = data.snapshot?.result;
  const inp = data.snapshot?.inputs ?? {};
  const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
  const verdictVariant = r?.verdict === "양호" ? "go" : r?.verdict === "주의" ? "caution" : "nogo";
  const statusLabel = product.status === "검토중" ? "후보" : product.status === "판매중" ? "판매중" : "폐기";

  return (
    <div className="space-y-4 pb-4">
      <Link href="/products" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> 목록
      </Link>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold leading-tight">{product.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{statusLabel}</Badge>
            {category && <span>{category.major}{category.middle ? ` › ${category.middle}` : ""}</span>}
          </div>
        </div>
        {r && <Badge variant={verdictVariant} className="text-sm">{r.verdict}</Badge>}
      </div>

      {product.sourceUrl && (
        <a
          href={product.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary underline"
        >
          상품 링크 열기 <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}

      {/* 마진 결과 */}
      {r ? (
        <Card className="border-2 border-primary/30 shadow-pop">
          <CardContent className="space-y-3 p-5">
            <span className="text-sm font-medium text-muted-foreground">최종 마진</span>
            <div className="flex items-end gap-3">
              <span className={`text-4xl font-extrabold tabular-nums ${r.marginAfterAd < 0 ? "text-red-600" : ""}`}>
                {won(r.marginAfterAd)}
              </span>
              <span className="pb-1 text-lg font-bold text-muted-foreground">{pct(r.marginRateAfterAd)}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <Line label="판매가" value={won(data.salePrice)} />
              <Line label="착지원가" value={won(r.landedCost)} />
              <Line label="판매수수료" value={won(r.commission)} />
              <Line label="입출고비" value={won(r.inboundShipFee)} />
              <Line label="납부부가세" value={won(r.vatPayable)} />
              <Line label="손익 ROAS" value={r.breakevenRoas > 0 ? `${r.breakevenRoas}배` : "-"} />
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            저장된 계산 내역이 없습니다.
          </CardContent>
        </Card>
      )}

      {/* 사입 정보 */}
      <Card>
        <CardContent className="space-y-1.5 p-4 text-sm">
          <p className="mb-1 font-bold">사입 정보</p>
          <Line label="사입 방식" value={inp.sourcing === "domestic" ? "국내 도매" : "해외 (중국)"} />
          {inp.sourcing === "domestic" ? (
            <Line label="원가" value={won(num(inp.costKrw))} />
          ) : (
            <>
              <Line label="원가 (위안)" value={`${num(inp.costCny)}¥`} />
              <Line label="내륙운송비 (위안)" value={`${num(inp.cnInland)}¥`} />
              <Line label="환율/가산" value={`${num(inp.fx)} + ${num(inp.surcharge)}`} />
            </>
          )}
        </CardContent>
      </Card>

      {/* 액션 */}
      <div className="space-y-2">
        <Button asChild size="lg" variant="outline" className="w-full">
          <Link href={`/calc?load=${product.id}`}>
            <Pencil className="h-4 w-4" /> 계산 수정하기
          </Link>
        </Button>
        <div className="grid grid-cols-2 gap-2">
          {product.status !== "판매중" && (
            <Button className="w-full" onClick={() => setStatus.mutate("판매중")}>
              <CheckCircle2 className="h-4 w-4" /> 판매등록
            </Button>
          )}
          {product.status !== "중단" ? (
            <Button variant="outline" className="w-full" onClick={() => setStatus.mutate("중단")}>
              <Trash2 className="h-4 w-4" /> 폐기
            </Button>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => setStatus.mutate("검토중")}>
              <RotateCcw className="h-4 w-4" /> 후보로 복원
            </Button>
          )}
        </div>
        <button
          onClick={() => {
            if (confirm("정말 삭제할까요? 되돌릴 수 없습니다.")) del.mutate();
          }}
          className="w-full py-2 text-center text-sm text-muted-foreground"
        >
          영구 삭제
        </button>
      </div>
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
