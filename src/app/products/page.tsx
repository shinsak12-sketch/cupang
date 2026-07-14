"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Product = {
  id: number;
  name: string;
  status: string;
  sourceOfferId: string | null;
  setQty: number;
  returnResalable: boolean;
  pkgWeightG: number | null;
  updatedAt: string;
};

export default function ProductsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const r = await fetch("/api/products");
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<{ rows: Product[] }>;
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">SKU 목록</h1>
          <p className="text-sm text-muted-foreground">
            1688 URL 붙여넣기로 등록 → 사이즈 판정 · 3시나리오 GO/NO-GO 판정
          </p>
        </div>
        <Button asChild>
          <Link href="/products/new">+ SKU 등록</Link>
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">불러오는 중…</p>}
      {error && <p className="text-sm text-destructive">DB 연결 필요: {String(error)}</p>}

      {data && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>offer_id</TableHead>
              <TableHead className="text-right">세트</TableHead>
              <TableHead>반품재판매</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  등록된 SKU가 없습니다. 시딩하면 &quot;양말 (데모 프로파일)&quot;이 있습니다.
                </TableCell>
              </TableRow>
            )}
            {data.rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  <Link href={`/products/${p.id}`} className="hover:underline">
                    {p.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{p.status}</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">{p.sourceOfferId ?? "-"}</TableCell>
                <TableCell className="text-right">{p.setQty}족</TableCell>
                <TableCell>
                  {p.returnResalable ? (
                    <Badge variant="outline">가능</Badge>
                  ) : (
                    <Badge variant="nogo">원가전손</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/products/${p.id}`}>분석 →</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
