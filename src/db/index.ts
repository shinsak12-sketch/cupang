import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { getServerEnv } from "@/lib/env";
import * as schema from "./schema";

/**
 * Neon serverless HTTP 드라이버 기반 Drizzle 클라이언트.
 * 🔴 lazy 초기화 — 모듈 import 시점이 아니라 첫 사용시 env 를 읽는다.
 *    (그래야 DATABASE_URL 없이도 next build 의 정적 분석이 통과)
 */
let _db: NeonHttpDatabase<typeof schema> | null = null;

function getDb(): NeonHttpDatabase<typeof schema> {
  if (_db) return _db;
  const sql = neon(getServerEnv().DATABASE_URL);
  _db = drizzle(sql, { schema });
  return _db;
}

// 프록시로 감싸 기존 `db.select(...)` 사용법을 그대로 유지
export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_t, prop) {
    const target = getDb() as unknown as Record<string | symbol, unknown>;
    const val = target[prop];
    return typeof val === "function" ? (val as (...a: unknown[]) => unknown).bind(target) : val;
  },
});

export { schema };
