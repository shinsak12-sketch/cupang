import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(process.cwd());
const seedDir = resolve(root, "seed");
const csvNames = ["fee_category","fee_logistics","fee_misc","promotion","assumption_default"];
const csv = {};
for (const n of csvNames) csv[n] = readFileSync(resolve(seedDir, `${n}.csv`), "utf8");
// 모든 마이그레이션 .sql 을 순서대로 이어붙임 (신규 테이블도 셋업에서 생성되도록)
const sqlFiles = readdirSync(resolve(root,"drizzle")).filter(f=>f.endsWith(".sql")).sort();
const sql = sqlFiles.map(f=>readFileSync(resolve(root,"drizzle",f),"utf8")).join("\n--> statement-breakpoint\n");
const out = `// 🤖 자동생성 (scripts/gen-embedded.mjs) — 직접 수정 금지.
// 시드 CSV 5종 + 스키마 DDL(전체 마이그레이션) 을 번들에 임베드 → 서버리스 셋업.
export const SEED_CSV: Record<string,string> = ${JSON.stringify(csv, null, 2)};

export const SCHEMA_SQL: string = ${JSON.stringify(sql)};
`;
writeFileSync(resolve(root,"src/lib/seed/embedded.ts"), out);
console.log("wrote embedded.ts —", Object.keys(csv).length, "CSVs, SQL files:", sqlFiles.join(", "), "total", sql.length, "bytes");
