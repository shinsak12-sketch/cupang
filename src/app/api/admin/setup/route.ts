import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getServerEnv } from "@/lib/env";
import { applySchema } from "@/lib/seed/schema-runner";
import { seedAll } from "@/lib/seed/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 🔴 모바일/무CLI 원클릭 셋업 — db:push + db:seed 를 URL 한 번으로.
 * Basic Auth(미들웨어) + ?token=INGEST_TOKEN 이중 보호.
 *   POST /api/admin/setup?token=...&mode=all|schema|seed
 */
async function run(req: NextRequest) {
  const env = getServerEnv();
  const token = req.nextUrl.searchParams.get("token");
  if (token !== env.INGEST_TOKEN) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }
  const mode = req.nextUrl.searchParams.get("mode") ?? "all";
  const logs: string[] = [];
  const log = (m: string) => logs.push(m);

  try {
    let schemaResult = null;
    let seedResult = null;
    if (mode === "all" || mode === "schema") {
      schemaResult = await applySchema(db, log);
    }
    if (mode === "all" || mode === "seed") {
      seedResult = await seedAll(db, log);
    }
    return NextResponse.json({ ok: true, mode, schema: schemaResult, seed: seedResult, logs });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e), logs },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return run(req);
}
// GET 도 허용 — 모바일 브라우저 주소창에서 바로 실행 가능
export async function GET(req: NextRequest) {
  return run(req);
}
