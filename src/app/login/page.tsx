"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogIn } from "lucide-react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? "로그인 실패");
      }
      const from = new URLSearchParams(window.location.search).get("from");
      // 전체 새로고침으로 세션 쿠키 반영 + 내비 표시
      window.location.href = from && from.startsWith("/") ? from : "/";
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-2">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-primary to-violet-600 text-3xl shadow-pop">
            🧮
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">마진계산기</h1>
          <p className="mt-1 text-sm text-muted-foreground">쿠팡 로켓그로스 개인 셀러용</p>
        </div>

        <form onSubmit={submit} className="space-y-3 rounded-2xl border border-border/60 bg-card p-6 shadow-card">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">비밀번호</span>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호 입력"
              autoFocus
              autoComplete="current-password"
            />
          </label>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={busy || !password}>
            <LogIn className="h-4 w-4" /> {busy ? "확인 중…" : "로그인"}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          비밀번호는 배포 환경변수 <code>BASIC_AUTH_PASS</code> 값입니다.
        </p>
      </div>
    </div>
  );
}
