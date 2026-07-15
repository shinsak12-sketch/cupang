import "server-only";
import { sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "@/db/schema";
import { SCHEMA_SQL } from "./embedded";

type DB = NeonHttpDatabase<typeof schema>;

/**
 * 스키마 DDL 을 서버리스에서 실행 (drizzle-kit push 대체 — 모바일/무CLI 셋업용).
 * 임베드된 마이그레이션 SQL 을 statement-breakpoint 로 분리해 순차 실행.
 * 재실행 안전: "already exists" 류 오류는 스킵.
 */
export async function applySchema(
  db: DB,
  log: (m: string) => void = () => {}
): Promise<{ executed: number; skipped: number }> {
  const statements = SCHEMA_SQL.split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  let executed = 0;
  let skipped = 0;
  for (const stmt of statements) {
    try {
      await db.execute(sql.raw(stmt));
      executed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/already exists|duplicate/i.test(msg)) {
        skipped++;
      } else {
        log(`DDL 오류: ${msg}`);
        throw e;
      }
    }
  }
  log(`DDL 실행 ${executed} / 스킵(기존) ${skipped}`);
  return { executed, skipped };
}
