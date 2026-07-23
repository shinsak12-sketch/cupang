import "server-only";
import { eq, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { PgTable } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";
import { SEED_CSV } from "./embedded";
import { SOCKS_PROFILE } from "../../../seed/socks_profile";

type DB = NeonHttpDatabase<typeof schema>;

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
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      record.push(field);
      field = "";
    } else if (c === "\n") {
      record.push(field);
      rows.push(record);
      record = [];
      field = "";
    } else field += c;
  }
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    rows.push(record);
  }
  const ne = rows.filter((r) => r.some((v) => v.trim() !== ""));
  if (ne.length === 0) return [];
  const header = ne[0].map((h) => h.trim());
  return ne.slice(1).map((r) => {
    const o: Record<string, string> = {};
    header.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));
    return o;
  });
}

const readCsv = (name: keyof typeof SEED_CSV) => parseCsv(SEED_CSV[name]);
const bool = (v: string) => v.trim().toUpperCase() === "TRUE";
const numOrNull = (v: string) => (v.trim() === "" ? null : v.trim());
const intOrNull = (v: string) => (v.trim() === "" ? null : parseInt(v, 10));
const strOrNull = (v: string | undefined) => (v && v.trim() !== "" ? v.trim() : null);
function* chunked<T>(arr: T[], size: number): Generator<T[]> {
  for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size);
}

export interface SeedReport {
  feeCategory: number;
  feeLogistics: number;
  feeMisc: number;
  promotion: number;
  assumption: number;
  socks: string;
}

/**
 * 마스터 시딩 (CLI 스크립트 + /api/admin/setup 공유). 재실행 안전(idempotent).
 * fee_size_rule 은 의도적으로 비워둠 (윙 확인 필요).
 */
async function isEmpty(db: DB, table: PgTable): Promise<boolean> {
  const r = await db.select({ n: sql<number>`count(*)::int` }).from(table);
  return Number(r[0]?.n ?? 0) === 0;
}

export async function seedAll(db: DB, log: (m: string) => void = () => {}): Promise<SeedReport> {
  // fee_category — 이미 있으면 유지(상품 FK 참조 때문에 삭제 금지, idempotent)
  const cat = readCsv("fee_category");
  const catVals = cat.map((r) => ({
    major: r.major,
    middle: strOrNull(r.middle),
    minor: strOrNull(r.minor),
    commissionRate: r.commission_rate,
    isDefault: bool(r.is_default),
    rgEligible: !["식품", "음반", "도서"].includes(r.major),
    serviceFeeThreshold: intOrNull(r.service_fee_threshold),
    effectiveFrom: r.effective_from,
    isVerified: false,
    source: strOrNull(r.source),
  }));
  if (await isEmpty(db, schema.feeCategory)) {
    for (const c of chunked(catVals, 100)) await db.insert(schema.feeCategory).values(c);
    log(`fee_category: ${catVals.length}`);
  } else {
    log(`fee_category: 기존 유지(스킵)`);
  }

  // fee_logistics
  const log_ = readCsv("fee_logistics");
  const logVals = log_.map((r) => ({
    sizeType: r.size_type as (typeof schema.sizeTypeEnum.enumValues)[number],
    categoryGroup: null,
    priceMin: null,
    priceMax: null,
    inboundFee: parseInt(r.inbound_fee_min, 10),
    shippingFee: parseInt(r.shipping_fee_min, 10),
    effectiveFrom: r.effective_from,
    isVerified: false,
    source: strOrNull(r.source),
  }));
  if (await isEmpty(db, schema.feeLogistics)) {
    await db.insert(schema.feeLogistics).values(logVals);
    log(`fee_logistics: ${logVals.length}`);
  } else {
    log(`fee_logistics: 기존 유지(스킵)`);
  }

  // fee_misc
  const misc = readCsv("fee_misc");
  const miscVals = misc.map((r) => ({
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
  if (await isEmpty(db, schema.feeMisc)) {
    await db.insert(schema.feeMisc).values(miscVals);
    log(`fee_misc: ${miscVals.length}`);
  } else {
    log(`fee_misc: 기존 유지(스킵)`);
  }

  // promotion
  const promo = readCsv("promotion");
  const promoVals = promo.map((r) => {
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
      myStartDate: null,
      isActive: true,
      note: strOrNull(r.note),
      source: strOrNull(r.source),
    };
  });
  if (await isEmpty(db, schema.promotion)) {
    await db.insert(schema.promotion).values(promoVals);
    log(`promotion: ${promoVals.length}`);
  } else {
    log(`promotion: 기존 유지(스킵)`);
  }

  // assumption (_DEFAULT/카테고리)
  const asm = readCsv("assumption_default");
  const asmVals = asm.map((r) => ({
    productId: null,
    categoryMajor: r.category_major === "_DEFAULT" ? null : r.category_major,
    scenario: r.scenario as (typeof schema.scenarioEnum.enumValues)[number],
    returnRate: numOrNull(r.return_rate),
    defectRate: numOrNull(r.defect_rate),
    sellThroughRate: numOrNull(r.sell_through_rate),
    targetRoas: intOrNull(r.target_roas),
    avgStorageDays: intOrNull(r.avg_storage_days),
    isEstimate: true,
    dataSource: strOrNull(r.basis),
  }));
  if (await isEmpty(db, schema.assumption)) {
    await db.insert(schema.assumption).values(asmVals);
    log(`assumption: ${asmVals.length}`);
  } else {
    log(`assumption: 기존 유지(스킵)`);
  }

  // 양말 프로파일 (HS + 데모 상품 + 상품별 가정)
  const socks = await seedSocks(db);
  log(`socks: ${socks}`);

  return {
    feeCategory: catVals.length,
    feeLogistics: logVals.length,
    feeMisc: miscVals.length,
    promotion: promoVals.length,
    assumption: asmVals.length,
    socks,
  };
}

async function seedSocks(db: DB): Promise<string> {
  // 데모 상품이 이미 있으면 아무것도 건드리지 않음(hsCode FK 삭제 충돌 방지)
  const existing = await db.query.product.findFirst({
    where: (t, { eq: e }) => e(t.name, "양말 (데모 프로파일)"),
  });
  if (existing) return "이미 존재 → 스킵";

  const c = SOCKS_PROFILE.customs;
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

  const cat = await db.query.feeCategory.findFirst({
    where: (t, { and, eq: e }) =>
      and(e(t.major, SOCKS_PROFILE.category.major), e(t.middle, SOCKS_PROFILE.category.middle)),
  });

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
      returnResalable: false,
    })
    .returning();

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
  return "데모 상품 생성 + 가정 3시나리오";
}
