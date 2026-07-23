import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 저장 리스트 조회 (최신순). brief(JSON 문자열)는 객체로 파싱해 반환. */
export async function GET() {
  try {
    const rows = await db.select().from(schema.savedItem).orderBy(desc(schema.savedItem.createdAt));
    const items = rows.map((r) => {
      let brief: unknown = null;
      if (r.brief) {
        try {
          brief = JSON.parse(r.brief);
        } catch {
          brief = null;
        }
      }
      return { ...r, brief };
    });
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** 저장 추가/갱신 (upsert). 기존 값은 유지하고 넘어온 값만 덮어씀(COALESCE). */
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
  const briefStr =
    body.brief && typeof body.brief === "object"
      ? JSON.stringify(body.brief)
      : typeof body.brief === "string"
        ? body.brief
        : null;

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
        brief: briefStr,
      })
      .onConflictDoUpdate({
        target: schema.savedItem.keyword,
        set: {
          verdict: sql`COALESCE(excluded.verdict, ${schema.savedItem.verdict})`,
          margin: sql`COALESCE(excluded.margin, ${schema.savedItem.margin})`,
          reason: sql`COALESCE(excluded.reason, ${schema.savedItem.reason})`,
          caution: sql`COALESCE(excluded.caution, ${schema.savedItem.caution})`,
          monthlyVolume: sql`COALESCE(excluded.monthly_volume, ${schema.savedItem.monthlyVolume})`,
          comp: sql`COALESCE(excluded.comp, ${schema.savedItem.comp})`,
          brief: sql`COALESCE(excluded.brief, ${schema.savedItem.brief})`,
        },
      });
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
