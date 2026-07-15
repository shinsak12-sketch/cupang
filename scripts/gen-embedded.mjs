import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(process.cwd());
const seedDir = resolve(root, "seed");
const csvNames = ["fee_category","fee_logistics","fee_misc","promotion","assumption_default"];
const csv = {};
for (const n of csvNames) csv[n] = readFileSync(resolve(seedDir, `${n}.csv`), "utf8");
const sqlFile = readdirSync(resolve(root,"drizzle")).find(f=>f.endsWith(".sql"));
const sql = readFileSync(resolve(root,"drizzle",sqlFile),"utf8");
const out = `// 🤖 자동생성 (scripts/gen-embedded.mjs) — 직접 수정 금지.
// 시드 CSV 5종 + 스키마 DDL 을 번들에 임베드 → Vercel 서버리스에서 파일시스템 없이 셋업.
export const SEED_CSV: Record<string,string> = ${JSON.stringify(csv, null, 2)};

export const SCHEMA_SQL: string = ${JSON.stringify(sql)};
`;
writeFileSync(resolve(root,"src/lib/seed/embedded.ts"), out);
console.log("wrote src/lib/seed/embedded.ts —", Object.keys(csv).length, "CSVs, SQL", sql.length, "bytes, source", sqlFile);
