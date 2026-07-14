/**
 * 시딩 스크립트 — /seed/ 의 CSV 5종 + 양말 프로파일을 DB에 주입.
 *   npm run db:seed
 *
 * 원칙 (CLAUDE_CODE_PROMPT §7):
 *  - fee_category   : effective_from 원본, is_verified=FALSE (2019-11-25 기준)
 *  - fee_logistics  : is_verified=FALSE (하한값 플레이스홀더)
 *  - fee_misc       : 쿼터·55,000·3.3%만 확정, 나머지 미확인
 *  - assumption     : 전부 is_estimate=TRUE
 *  - fee_size_rule  : 시딩 없음 (공식 확인 불가 → 빈 테이블 유지)
 *  - 재실행 안전(idempotent): 마스터 테이블은 소스별로 비우고 다시 삽입.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { SOCKS_PROFILE } from "../seed/socks_profile";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_DIR = resolve(__dirname, "../seed");

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL 미설정. .env 를 확인하세요.");
  process.exit(1);
}

const db = drizzle(neon(process.env.DATABASE_URL), { schema });

/* --------------------------- CSV 파서 (RFC4180 최소구현) --------------------------- */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      record.push(field);
      field = "";
    } else if (c === "\n") {
      record.push(field);
      rows.push(record);
      record = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    rows.push(record);
  }

  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ""));
  if (nonEmpty.length === 0) return [];
  const header = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => (obj[h] = (r[idx] ?? "").trim()));
    return obj;
  });
}

function readCsv(name: string) {
  return parseCsv(readFileSync(resolve(SEED_DIR, name), "utf8"));
}

const bool = (v: string) => v.trim().toUpperCase() === "TRUE";
const numOrNull = (v: string) => (v.trim() === "" ? null : v.trim());
const intOrNull = (v: string) => (v.trim() === "" ? null : parseInt(v, 10));
const strOrNull = (v: string | undefined) => (v && v.trim() !== "" ? v.trim() : null);

/* --------------------------------- 시딩 --------------------------------- */
async function seedFeeCategory() {
  const rows = readCsv("fee_category.csv");
  await db.delete(schema.feeCategory);
  const values = rows.map((r) => ({
    major: r.major,
    middle: strOrNull(r.middle),
    minor: strOrNull(r.minor),
    commissionRate: r.commission_rate,
    isDefault: bool(r.is_default),
    // 식품/음반/도서는 RG 입점 불가
    rgEligible: !["식품", "음반", "도서"].includes(r.major),
    serviceFeeThreshold: intOrNull(r.service_fee_threshold),
    effectiveFrom: r.effective_from,
    // 🔴 출처가 2019-11-25 기준 → 미검증
    isVerified: false,
    source: strOrNull(r.source),
  }));
  // Neon HTTP는 한 요청당 파라미터 제한이 있어 청크 삽입
  for (const chunk of chunked(values, 100)) {
    await db.insert(schema.feeCategory).values(chunk);
  }
  console.log(`  ✓ fee_category: ${values.length}행 (is_verified=FALSE)`);
}

async function seedFeeLogistics() {
  const rows = readCsv("fee_logistics.csv");
  await db.delete(schema.feeLogistics);
  const values = rows.map((r) => ({
    sizeType: r.size_type as (typeof schema.sizeTypeEnum.enumValues)[number],
    categoryGroup: null,
    priceMin: null,
    priceMax: null,
    inboundFee: parseInt(r.inbound_fee_min, 10),
    shippingFee: parseInt(r.shipping_fee_min, 10),
    effectiveFrom: r.effective_from,
    isVerified: false, // 🔴 하한값 플레이스홀더
    source: strOrNull(r.source),
  }));
  await db.insert(schema.feeLogistics).values(values);
  console.log(`  ✓ fee_logistics: ${values.length}행 (is_verified=FALSE, 하한값)`);
}

async function seedFeeMisc() {
  const rows = readCsv("fee_misc.csv");
  await db.delete(schema.feeMisc);
  const values = rows.map((r) => ({
    feeKey: r.fee_key,
    feeNameKo: r.fee_name_ko,
    unit: r.unit as (typeof schema.feeUnitEnum.enumValues)[number],
    amount: numOrNull(r.amount),
    freeQuota: intOrNull(r.free_quota),
    freeDays: intOrNull(r.free_days),
    effectiveFrom: r.effective_from,
    isVerified: bool(r.is_verified),
    note: strOrNull(r.note),
    source: strOrNull(r.source),
  }));
  await db.insert(schema.feeMisc).values(values);
  console.log(`  ✓ fee_misc: ${values.length}행`);
}

async function seedPromotion() {
  const rows = readCsv("promotion.csv");
  await db.delete(schema.promotion);
  const values = rows.map((r) => {
    let waives: string[] = [];
    if (r.waives && r.waives.trim() !== "") {
      try {
        waives = JSON.parse(r.waives);
      } catch {
        waives = [];
      }
    }
    return {
      promoKey: r.promo_key,
      name: r.name,
      waives,
      capDays: intOrNull(r.cap_days),
      capAmount: numOrNull(r.cap_amount),
      applyStart: strOrNull(r.apply_start),
      applyEnd: strOrNull(r.apply_end),
      myStartDate: null, // 🔴 사용자가 /settings/promotions 에서 입력
      isActive: true,
      note: strOrNull(r.note),
      source: strOrNull(r.source),
    };
  });
  await db.insert(schema.promotion).values(values);
  console.log(`  ✓ promotion: ${values.length}행`);
}

async function seedAssumptions() {
  const rows = readCsv("assumption_default.csv");
  // 시드 소유 행(product_id NULL)만 정리
  await db.delete(schema.assumption);
  const values = rows.map((r) => ({
    productId: null,
    // "_DEFAULT" → NULL (schema: 둘다 null이면 _DEFAULT 폴백)
    categoryMajor: r.category_major === "_DEFAULT" ? null : r.category_major,
    scenario: r.scenario as (typeof schema.scenarioEnum.enumValues)[number],
    returnRate: numOrNull(r.return_rate),
    defectRate: numOrNull(r.defect_rate),
    sellThroughRate: numOrNull(r.sell_through_rate),
    targetRoas: intOrNull(r.target_roas),
    avgStorageDays: intOrNull(r.avg_storage_days),
    isEstimate: true, // 🔴 전부 추정
    dataSource: strOrNull(r.basis),
  }));
  await db.insert(schema.assumption).values(values);
  console.log(`  ✓ assumption(_DEFAULT/카테고리): ${values.length}행 (is_estimate=TRUE)`);
}

async function seedSocksProfile() {
  const c = SOCKS_PROFILE.customs;
  // HS 코드 (양말) — 미검증
  await db.delete(schema.hsCode).where(eq(schema.hsCode.hsCode, c.hsCode));
  const [hs] = await db
    .insert(schema.hsCode)
    .values({
      hsCode: c.hsCode,
      description: c.hsDescription,
      tariffRate: String(c.tariffRate),
      ftaApplicable: c.ftaApplicable,
      certRequired: c.certRequired,
      note: `${c.ftaNote} / ${c.certNote}`,
      isVerified: c.isVerified,
    })
    .returning();
  console.log(`  ✓ hs_code: 양말 ${c.hsCode} (tariff ${c.tariffRate}%, is_verified=FALSE)`);

  // 카테고리 매칭 (패션 > 패션잡화)
  const cat = await db.query.feeCategory.findFirst({
    where: (t, { and, eq: e }) =>
      and(e(t.major, SOCKS_PROFILE.category.major), e(t.middle, SOCKS_PROFILE.category.middle)),
  });

  // 데모 상품: 양말 (이미 있으면 스킵)
  const existing = await db.query.product.findFirst({
    where: (t, { eq: e }) => e(t.name, "양말 (데모 프로파일)"),
  });
  if (existing) {
    console.log("  · product(양말 데모) 이미 존재 → 스킵");
    return;
  }
  const p = SOCKS_PROFILE.size.typicalPackage;
  const [socks] = await db
    .insert(schema.product)
    .values({
      name: "양말 (데모 프로파일)",
      memo: "⚠️ 모든 수치는 가정. 윙 로그인 후 실측/실요율로 교체 필요.",
      status: "검토중",
      categoryId: cat?.id ?? null,
      hsCodeId: hs?.id ?? null,
      pkgWMm: p.widthMm,
      pkgDMm: p.depthMm,
      pkgHMm: p.heightMm,
      pkgWeightG: p.weightG,
      setQty: 1,
      // 🔴 양말=위생상 반품 재판매 불가 → 원가 전손
      returnResalable: false,
    })
    .returning();

  // 상품별 가정값 (양말 프로파일 override, product_id > category > _DEFAULT)
  const a = SOCKS_PROFILE.assumptions;
  const scen: Array<["optimistic" | "base" | "pessimistic", typeof a.optimistic]> = [
    ["optimistic", a.optimistic],
    ["base", a.base],
    ["pessimistic", a.pessimistic],
  ];
  await db.insert(schema.assumption).values(
    scen.map(([scenario, v]) => ({
      productId: socks.id,
      categoryMajor: null,
      scenario,
      returnRate: String(v.returnRate),
      defectRate: String(v.defectRate),
      sellThroughRate: String(v.sellThrough),
      targetRoas: v.roas,
      avgStorageDays: v.storageDays,
      isEstimate: true,
      dataSource: "socks_profile.ts",
    }))
  );
  console.log(`  ✓ product(양말 데모) + 상품별 가정 3시나리오 (return_resalable=FALSE)`);
}

function* chunked<T>(arr: T[], size: number): Generator<T[]> {
  for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size);
}

async function main() {
  console.log("🌱 시딩 시작...");
  await seedFeeCategory();
  await seedFeeLogistics();
  await seedFeeMisc();
  await seedPromotion();
  await seedAssumptions();
  await seedSocksProfile();
  console.log("✅ 시딩 완료.");
  console.log(
    "ℹ️  fee_size_rule 은 의도적으로 비어 있습니다 — 윙에서 사이즈 임계값 확인 후 입력하세요."
  );
}

main().catch((e) => {
  console.error("❌ 시딩 실패:", e);
  process.exit(1);
});
