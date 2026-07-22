import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 저장 리스트 조회 (최신순). */
export async function GET() {
  try {
    const rows = await db.select().from(schema.savedItem).orderBy(desc(schema.savedItem.createdAt));
    return NextResponse.json({ items: rows });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** 저장 추가 (같은 키워드는 무시). */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const keyword = typeof body.keyword === "string" ? body.keyword.trim() : "";
  if (!keyword) return NextResponse.json({ error: "keyword 필요" }, { status: 400 });

  const s = (v: unknown) => (typeof v === "string" ? v : null);
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  try {
    await db
      .insert(schema.savedItem)
      .values({
        keyword,
        verdict: s(body.verdict),
        margin: s(body.margin),
        reason: s(body.reason),
        caution: s(body.caution),
        monthlyVolume: num(body.monthlyVolume),
        comp: s(body.comp),
      })
      .onConflictDoNothing({ target: schema.savedItem.keyword });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** 저장 삭제 (?keyword=). */
export async function DELETE(req: NextRequest) {
  const keyword = (req.nextUrl.searchParams.get("keyword") ?? "").trim();
  if (!keyword) return NextResponse.json({ error: "keyword 필요" }, { status: 400 });
  try {
    await db.delete(schema.savedItem).where(eq(schema.savedItem.keyword, keyword));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
