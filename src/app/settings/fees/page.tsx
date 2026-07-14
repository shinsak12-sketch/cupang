"use client";

import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { won, pct } from "@/lib/utils";
import { todayIso } from "@/lib/date";

type Category = {
  id: number;
  major: string;
  middle: string | null;
  minor: string | null;
  commissionRate: string;
  serviceFeeThreshold: number | null;
  rgEligible: boolean;
  isVerified: boolean;
  effectiveFrom: string;
};
type Logistics = {
  id: number;
  sizeType: string;
  categoryGroup: string | null;
  priceMin: number | null;
  priceMax: number | null;
  inboundFee: number;
  shippingFee: number;
  isVerified: boolean;
};
type Misc = {
  id: number;
  feeKey: string;
  feeNameKo: string;
  unit: string;
  amount: string | null;
  freeQuota: number | null;
  freeDays: number | null;
  isVerified: boolean;
  note: string | null;
};

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function VerifyBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <Badge variant="secondary">검증됨</Badge>
  ) : (
    <Badge variant="warn" title="윙에서 실제값 확인 필요">
      미검증
    </Badge>
  );
}

export default function FeesPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">수수료 테이블</h1>
          <p className="text-sm text-muted-foreground">
            요율은 하드코딩되지 않고 유효기간(effective_from/to)으로 버전 관리됩니다.
            <span className="ml-1 text-warn font-medium">미검증 행은 노란 배지</span>로 표시됩니다.
          </p>
        </div>
        <Button asChild>
          <Link href="/settings/fees/import">CSV/XLSX 업로드 →</Link>
        </Button>
      </div>

      <Tabs defaultValue="category">
        <TabsList>
          <TabsTrigger value="category">카테고리 요율</TabsTrigger>
          <TabsTrigger value="logistics">물류비 매트릭스</TabsTrigger>
          <TabsTrigger value="misc">기타 수수료</TabsTrigger>
        </TabsList>
        <TabsContent value="category">
          <CategoryTab />
        </TabsContent>
        <TabsContent value="logistics">
          <LogisticsTab />
        </TabsContent>
        <TabsContent value="misc">
          <MiscTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CategoryTab() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["fees", "category"],
    queryFn: () => getJson<{ rows: Category[] }>("/api/fees/category"),
  });
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [rate, setRate] = useState("");

  const verify = useMutation({
    mutationFn: (id: number) =>
      fetch("/api/fees/category", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", id }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fees", "category"] }),
  });
  const reprice = useMutation({
    mutationFn: (v: { id: number; commissionRate: string }) =>
      fetch("/api/fees/category", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reprice",
          id: v.id,
          commissionRate: v.commissionRate,
          effectiveFrom: todayIso(),
          isVerified: true,
        }),
      }),
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["fees", "category"] });
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">불러오는 중…</p>;
  if (error) return <p className="text-sm text-destructive">DB 연결 필요: {String(error)}</p>;

  const rows = (data?.rows ?? []).filter((r) =>
    `${r.major}${r.middle ?? ""}${r.minor ?? ""}`.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-3">
      <Input
        placeholder="카테고리 검색 (예: 패션, 양말)"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="max-w-xs"
      />
      <p className="text-xs text-muted-foreground">
        요율 인라인 편집 → 저장시 <b>오늘 날짜로 신규 버전 생성</b>, 기존 버전은 자동 마감됩니다.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>대분류</TableHead>
            <TableHead>중분류</TableHead>
            <TableHead>소분류</TableHead>
            <TableHead className="text-right">판매수수료</TableHead>
            <TableHead className="text-right">서비스료 기준</TableHead>
            <TableHead>RG</TableHead>
            <TableHead>상태</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.major}</TableCell>
              <TableCell>{r.middle ?? "-"}</TableCell>
              <TableCell>{r.minor ?? "-"}</TableCell>
              <TableCell className="text-right">
                {editing === r.id ? (
                  <div className="flex items-center justify-end gap-1">
                    <Input
                      value={rate}
                      onChange={(e) => setRate(e.target.value)}
                      className="h-7 w-20 text-right"
                    />
                    <Button
                      size="sm"
                      onClick={() => reprice.mutate({ id: r.id, commissionRate: rate })}
                    >
                      저장
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      취소
                    </Button>
                  </div>
                ) : (
                  <button
                    className="tabular-nums hover:underline"
                    onClick={() => {
                      setEditing(r.id);
                      setRate(String(r.commissionRate));
                    }}
                  >
                    {pct(r.commissionRate)}
                  </button>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {won(r.serviceFeeThreshold)}
              </TableCell>
              <TableCell>
                {r.rgEligible ? (
                  <Badge variant="secondary">가능</Badge>
                ) : (
                  <Badge variant="destructive">입점불가</Badge>
                )}
              </TableCell>
              <TableCell>
                <VerifyBadge verified={r.isVerified} />
              </TableCell>
              <TableCell>
                {!r.isVerified && (
                  <Button size="sm" variant="outline" onClick={() => verify.mutate(r.id)}>
                    검증표시
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function LogisticsTab() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["fees", "logistics"],
    queryFn: () => getJson<{ rows: Logistics[] }>("/api/fees/logistics"),
  });
  const [editing, setEditing] = useState<number | null>(null);
  const [inbound, setInbound] = useState("");
  const [shipping, setShipping] = useState("");

  const verify = useMutation({
    mutationFn: (id: number) =>
      fetch("/api/fees/logistics", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", id }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fees", "logistics"] }),
  });
  const update = useMutation({
    mutationFn: (v: { id: number }) =>
      fetch("/api/fees/logistics", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: v.id,
          inboundFee: Number(inbound),
          shippingFee: Number(shipping),
          effectiveFrom: todayIso(),
          isVerified: true,
        }),
      }),
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["fees", "logistics"] });
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">불러오는 중…</p>;
  if (error) return <p className="text-sm text-destructive">DB 연결 필요: {String(error)}</p>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-warn">
        🔴 현재 값은 공식 페이지 <b>하한값 플레이스홀더</b>입니다. 실제 요금은 카테고리×사이즈×판매가
        3중 매트릭스 — 윙에서 확인 후 업로드/편집하세요.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>사이즈</TableHead>
            <TableHead>카테고리군</TableHead>
            <TableHead>판매가 구간</TableHead>
            <TableHead className="text-right">입출고비</TableHead>
            <TableHead className="text-right">배송비</TableHead>
            <TableHead>상태</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(data?.rows ?? []).map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.sizeType}</TableCell>
              <TableCell>{r.categoryGroup ?? "전체"}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {r.priceMin === null && r.priceMax === null
                  ? "전체"
                  : `${won(r.priceMin)} ~ ${r.priceMax === null ? "∞" : won(r.priceMax)}`}
              </TableCell>
              {editing === r.id ? (
                <>
                  <TableCell className="text-right">
                    <Input
                      value={inbound}
                      onChange={(e) => setInbound(e.target.value)}
                      className="h-7 w-24 text-right"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      value={shipping}
                      onChange={(e) => setShipping(e.target.value)}
                      className="h-7 w-24 text-right"
                    />
                  </TableCell>
                  <TableCell colSpan={2}>
                    <div className="flex gap-1">
                      <Button size="sm" onClick={() => update.mutate({ id: r.id })}>
                        저장
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        취소
                      </Button>
                    </div>
                  </TableCell>
                </>
              ) : (
                <>
                  <TableCell className="text-right tabular-nums">{won(r.inboundFee)}</TableCell>
                  <TableCell className="text-right tabular-nums">{won(r.shippingFee)}</TableCell>
                  <TableCell>
                    <VerifyBadge verified={r.isVerified} />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditing(r.id);
                          setInbound(String(r.inboundFee));
                          setShipping(String(r.shippingFee));
                        }}
                      >
                        편집
                      </Button>
                      {!r.isVerified && (
                        <Button size="sm" variant="ghost" onClick={() => verify.mutate(r.id)}>
                          검증표시
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function MiscTab() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["fees", "misc"],
    queryFn: () => getJson<{ rows: Misc[] }>("/api/fees/misc"),
  });
  if (isLoading) return <p className="text-sm text-muted-foreground">불러오는 중…</p>;
  if (error) return <p className="text-sm text-destructive">DB 연결 필요: {String(error)}</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>키</TableHead>
          <TableHead>이름</TableHead>
          <TableHead>단위</TableHead>
          <TableHead className="text-right">금액</TableHead>
          <TableHead className="text-right">무료쿼터</TableHead>
          <TableHead className="text-right">무료일수</TableHead>
          <TableHead>상태</TableHead>
          <TableHead>비고</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {(data?.rows ?? []).map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-mono text-xs">{r.feeKey}</TableCell>
            <TableCell>{r.feeNameKo}</TableCell>
            <TableCell className="text-xs text-muted-foreground">{r.unit}</TableCell>
            <TableCell className="text-right tabular-nums">
              {r.unit === "rate" ? pct(r.amount) : won(r.amount)}
            </TableCell>
            <TableCell className="text-right tabular-nums">{r.freeQuota ?? "-"}</TableCell>
            <TableCell className="text-right tabular-nums">{r.freeDays ?? "-"}</TableCell>
            <TableCell>
              <VerifyBadge verified={r.isVerified} />
            </TableCell>
            <TableCell className="max-w-xs text-xs text-muted-foreground">{r.note}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
