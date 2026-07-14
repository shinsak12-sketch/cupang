"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Category = { id: number; major: string; middle: string | null; minor: string | null; isVerified: boolean };

function parseOfferId(url: string): string | null {
  const m = url.match(/\/offer\/(\d+)\.html/);
  return m ? m[1] : null;
}

export default function NewProductPage() {
  const router = useRouter();
  const { data: cats } = useQuery({
    queryKey: ["fees", "category"],
    queryFn: async () => {
      const r = await fetch("/api/fees/category");
      return r.ok ? ((await r.json()).rows as Category[]) : [];
    },
  });

  const [form, setForm] = useState({
    name: "",
    sourceUrl: "",
    categoryId: "",
    memo: "",
    setQty: "1",
    returnResalable: "true",
    pkgWMm: "",
    pkgDMm: "",
    pkgHMm: "",
    pkgWeightG: "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const offerId = parseOfferId(form.sourceUrl);

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const body = {
        name: form.name,
        sourceUrl: form.sourceUrl || undefined,
        categoryId: form.categoryId ? Number(form.categoryId) : null,
        memo: form.memo || undefined,
        setQty: Number(form.setQty) || 1,
        returnResalable: form.returnResalable === "true",
        pkgWMm: form.pkgWMm ? Number(form.pkgWMm) : undefined,
        pkgDMm: form.pkgDMm ? Number(form.pkgDMm) : undefined,
        pkgHMm: form.pkgHMm ? Number(form.pkgHMm) : undefined,
        pkgWeightG: form.pkgWeightG ? Number(form.pkgWeightG) : undefined,
      };
      const r = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(data.error ?? data));
      router.push(`/products/${data.row.id}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">SKU 등록</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1688 원본</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-sm">상품 URL (offer_id 자동 파싱)</label>
            <Input
              value={form.sourceUrl}
              onChange={set("sourceUrl")}
              placeholder="https://detail.1688.com/offer/123456789.html"
            />
            {form.sourceUrl && (
              <p className="mt-1 text-xs text-muted-foreground">
                offer_id: {offerId ?? "파싱 실패 — 수동 등록으로 진행됩니다(폴백)"}
              </p>
            )}
          </div>
          <div>
            <label className="text-sm">상품명 *</label>
            <Input value={form.name} onChange={set("name")} placeholder="예: 무지 순면 양말 5족" />
          </div>
          <div>
            <label className="text-sm">카테고리</label>
            <select
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              <option value="">(선택 안 함)</option>
              {(cats ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.major}
                  {c.middle ? ` > ${c.middle}` : ""}
                  {c.minor ? ` > ${c.minor}` : ""}
                  {!c.isVerified ? " (미검증)" : ""}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">포장 실측 (🔴 실제 과금 기준)</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="가로 mm" value={form.pkgWMm} onChange={set("pkgWMm")} />
          <Field label="세로 mm" value={form.pkgDMm} onChange={set("pkgDMm")} />
          <Field label="높이 mm" value={form.pkgHMm} onChange={set("pkgHMm")} />
          <Field label="무게 g" value={form.pkgWeightG} onChange={set("pkgWeightG")} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">세트 & 반품</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <Field label="세트 수량(족)" value={form.setQty} onChange={set("setQty")} />
          <div>
            <label className="text-sm">반품 재판매</label>
            <select
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={form.returnResalable}
              onChange={(e) => setForm({ ...form, returnResalable: e.target.value })}
            >
              <option value="true">가능</option>
              <option value="false">불가 (위생용품 → 원가 전손)</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {msg && <p className="text-sm text-destructive">{msg}</p>}
      <div className="flex gap-2">
        <Button onClick={submit} disabled={busy || !form.name}>
          등록하고 분석
        </Button>
        <Button variant="ghost" onClick={() => router.back()}>
          취소
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div>
      <label className="text-sm">{label}</label>
      <Input value={value} onChange={onChange} inputMode="numeric" />
    </div>
  );
}
