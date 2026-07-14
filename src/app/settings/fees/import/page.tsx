"use client";

import Link from "next/link";
import { useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { todayIso } from "@/lib/date";

type ImportTable = "fee_category" | "fee_logistics";

// 타겟 필드 정의 (매핑 UI 용)
const TARGET_FIELDS: Record<ImportTable, { key: string; label: string; required: boolean }[]> = {
  fee_category: [
    { key: "major", label: "대분류", required: true },
    { key: "middle", label: "중분류", required: false },
    { key: "minor", label: "소분류", required: false },
    { key: "commission_rate", label: "판매수수료(%)", required: true },
    { key: "service_fee_threshold", label: "서비스료 기준", required: false },
  ],
  fee_logistics: [
    { key: "size_type", label: "사이즈(XS~XL)", required: true },
    { key: "category_group", label: "카테고리군", required: false },
    { key: "price_min", label: "판매가 하한", required: false },
    { key: "price_max", label: "판매가 상한", required: false },
    { key: "inbound_fee", label: "입출고비", required: true },
    { key: "shipping_fee", label: "배송비", required: true },
  ],
};

type DiffFieldChange = { field: string; before: string | null; after: string | null };
type DiffRow = {
  status: "added" | "changed" | "unchanged";
  keyLabel: string;
  changes: DiffFieldChange[];
  affectedSkuCount: number;
};
type Diff = {
  table: ImportTable;
  effectiveFrom: string;
  rows: DiffRow[];
  summary: { added: number; changed: number; unchanged: number; affectedSku: number };
};

export default function ImportPage() {
  const [table, setTable] = useState<ImportTable>("fee_category");
  const [fileCols, setFileCols] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso());
  const [markVerified, setMarkVerified] = useState(true);
  const [diff, setDiff] = useState<Diff | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onFile(f: File) {
    setMsg(null);
    setDiff(null);
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
    if (json.length === 0) {
      setMsg("빈 파일입니다.");
      return;
    }
    const cols = Object.keys(json[0]);
    setFileCols(cols);
    setRawRows(json);
    // 자동 매핑 (동일 이름 우선)
    const auto: Record<string, string> = {};
    for (const tf of TARGET_FIELDS[table]) {
      const hit = cols.find((c) => c.toLowerCase() === tf.key.toLowerCase());
      if (hit) auto[tf.key] = hit;
    }
    setMapping(auto);
  }

  function mappedRows(): Record<string, unknown>[] {
    return rawRows.map((r) => {
      const o: Record<string, unknown> = {};
      for (const tf of TARGET_FIELDS[table]) {
        const src = mapping[tf.key];
        if (src) o[tf.key] = r[src];
      }
      return o;
    });
  }

  const missingRequired = TARGET_FIELDS[table]
    .filter((f) => f.required && !mapping[f.key])
    .map((f) => f.label);

  async function preview() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/fees/import?mode=preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table, effectiveFrom, rows: mappedRows(), markVerified }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data.error ?? data));
      setDiff(data.diff);
    } catch (e) {
      setMsg(`프리뷰 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/fees/import?mode=apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table, effectiveFrom, rows: mappedRows(), markVerified }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data.error ?? data));
      setMsg(`✅ 적용 완료 — 신규 ${data.inserted}건, 기존버전 마감 ${data.closed}건`);
      setDiff(null);
    } catch (e) {
      setMsg(`적용 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/settings/fees" className="text-sm text-muted-foreground hover:underline">
          ← 수수료 테이블
        </Link>
        <h1 className="text-2xl font-bold">수수료 업로드 (CSV / XLSX)</h1>
        <p className="text-sm text-muted-foreground">
          파일 → 컬럼 매핑 → <b className="text-warn">diff 프리뷰</b> → 확정. 확정시 신규 버전이
          생성되고 기존 버전은 자동 마감됩니다.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. 대상 테이블 & 파일</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            {(["fee_category", "fee_logistics"] as const).map((t) => (
              <Button
                key={t}
                variant={table === t ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setTable(t);
                  setMapping({});
                  setDiff(null);
                }}
              >
                {t === "fee_category" ? "카테고리 요율" : "물류비 매트릭스"}
              </Button>
            ))}
            <a
              href={`/api/fees/template?table=${table}`}
              className="ml-auto self-center text-xs text-muted-foreground hover:underline"
            >
              템플릿 다운로드
            </a>
          </div>
          <Input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          {rawRows.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {rawRows.length}행 로드됨 · 파일 컬럼: {fileCols.join(", ")}
            </p>
          )}
        </CardContent>
      </Card>

      {fileCols.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. 컬럼 매핑</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {TARGET_FIELDS[table].map((tf) => (
              <div key={tf.key} className="flex items-center gap-3">
                <label className="w-40 text-sm">
                  {tf.label}
                  {tf.required && <span className="text-destructive"> *</span>}
                </label>
                <select
                  className="h-9 flex-1 rounded-md border border-input bg-transparent px-3 text-sm"
                  value={mapping[tf.key] ?? ""}
                  onChange={(e) => setMapping({ ...mapping, [tf.key]: e.target.value })}
                >
                  <option value="">(매핑 안 함)</option>
                  {fileCols.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <label className="flex items-center gap-2 text-sm">
                effective_from
                <Input
                  type="date"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  className="h-8 w-40"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={markVerified}
                  onChange={(e) => setMarkVerified(e.target.checked)}
                />
                검증됨(is_verified)으로 표시
              </label>
              <Button
                onClick={preview}
                disabled={busy || missingRequired.length > 0}
                className="ml-auto"
              >
                diff 프리뷰
              </Button>
            </div>
            {missingRequired.length > 0 && (
              <p className="text-xs text-destructive">
                필수 매핑 누락: {missingRequired.join(", ")}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {msg && <p className="text-sm">{msg}</p>}

      {diff && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. diff 프리뷰</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="go">신규 {diff.summary.added}</Badge>
              <Badge variant="caution">변경 {diff.summary.changed}</Badge>
              <Badge variant="secondary">동일 {diff.summary.unchanged}</Badge>
              <Badge variant="outline">영향 SKU {diff.summary.affectedSku}개</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              ℹ️ 마진 영향(%p)은 계산엔진(Phase 1-B) 연결 후 표시됩니다. 현재는 영향 SKU 수까지 정직하게 계산합니다.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>상태</TableHead>
                  <TableHead>키</TableHead>
                  <TableHead>변경 내용</TableHead>
                  <TableHead className="text-right">영향 SKU</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diff.rows
                  .filter((r) => r.status !== "unchanged")
                  .map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        {r.status === "added" ? (
                          <Badge variant="go">신규</Badge>
                        ) : (
                          <Badge variant="caution">변경</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{r.keyLabel}</TableCell>
                      <TableCell className="text-xs">
                        {r.changes.map((c) => (
                          <div key={c.field}>
                            <span className="text-muted-foreground">{c.field}: </span>
                            <span className="line-through">{c.before ?? "∅"}</span>
                            {" → "}
                            <span className="font-semibold">{c.after ?? "∅"}</span>
                          </div>
                        ))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.affectedSkuCount || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
            <div className="flex justify-end">
              <Button onClick={apply} disabled={busy}>
                확정 적용
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
