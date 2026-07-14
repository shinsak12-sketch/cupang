import { NextResponse } from "next/server";
import { asc, isNull } from "drizzle-orm";
import { db, schema } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — 기타 수수료(보관/반품/월이용료 등) 현재 유효 목록
export async function GET() {
  const rows = await db
    .select()
    .from(schema.feeMisc)
    .where(isNull(schema.feeMisc.effectiveTo))
    .orderBy(asc(schema.feeMisc.feeKey));
  return NextResponse.json({ rows });
}
