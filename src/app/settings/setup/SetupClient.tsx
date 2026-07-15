"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Result = {
  ok: boolean;
  error?: string;
  schema?: { executed: number; skipped: number } | null;
  seed?: Record<string, unknown> | null;
  logs?: string[];
};

export function SetupButton({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);

  async function run(mode: "all" | "schema" | "seed") {
    setBusy(true);
    setRes(null);
    try {
      const r = await fetch(`/api/admin/setup?mode=${mode}&token=${encodeURIComponent(token)}`, {
        method: "POST",
      });
      setRes(await r.json());
    } catch (e) {
      setRes({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => run("all")} disabled={busy}>
          {busy ? "실행 중…" : "① 스키마 생성 + ② 시딩 (전체)"}
        </Button>
        <Button variant="outline" onClick={() => run("schema")} disabled={busy}>
          스키마만
        </Button>
        <Button variant="outline" onClick={() => run("seed")} disabled={busy}>
          시딩만
        </Button>
      </div>

      {res && (
        <div
          className={`rounded-md border p-3 text-sm ${
            res.ok ? "border-emerald-500/50" : "border-destructive/50"
          }`}
        >
          {res.ok ? (
            <p className="font-semibold text-emerald-600">✅ 완료</p>
          ) : (
            <p className="font-semibold text-destructive">❌ 실패: {res.error}</p>
          )}
          {res.schema && (
            <p className="text-xs text-muted-foreground">
              DDL: 실행 {res.schema.executed} · 스킵(기존) {res.schema.skipped}
            </p>
          )}
          {res.seed && (
            <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs">
              {JSON.stringify(res.seed, null, 2)}
            </pre>
          )}
          {res.logs && res.logs.length > 0 && (
            <ul className="mt-1 text-xs text-muted-foreground">
              {res.logs.map((l, i) => (
                <li key={i}>· {l}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
