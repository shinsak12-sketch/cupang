import { NextResponse } from "next/server";
import { isNull, asc } from "drizzle-orm";
import { db, schema } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 기본/카테고리 가정값 (product_id NULL) 조회
export async function GET() {
  const rows = await db
    .select()
    .from(schema.assumption)
    .where(isNull(schema.assumption.productId))
    .orderBy(asc(schema.assumption.categoryMajor));
  return NextResponse.json({ rows });
}
