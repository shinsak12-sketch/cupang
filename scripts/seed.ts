/**
 * 시딩 CLI — /seed 데이터를 DB에 주입. 로직은 src/lib/seed/core.ts 공유(셋업 API와 동일).
 *   npm run db:seed
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "../src/db/schema";
import { seedAll } from "../src/lib/seed/core";

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL 미설정. .env 를 확인하세요.");
  process.exit(1);
}

const db = drizzle(neon(process.env.DATABASE_URL), { schema });

seedAll(db, (m) => console.log("  ✓", m))
  .then((r) => {
    console.log("✅ 시딩 완료:", JSON.stringify(r));
    console.log("ℹ️ fee_size_rule 은 의도적으로 비어 있습니다 — 윙 확인 후 입력.");
  })
  .catch((e) => {
    console.error("❌ 시딩 실패:", e);
    process.exit(1);
  });
