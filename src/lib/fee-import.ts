import "server-only";
import { and, eq, isNull, count } from "drizzle-orm";
import { db, schema } from "@/db";
import { prevDay, todayIso } from "@/lib/date";

/**
 * 수수료 테이블 CSV/XLSX 업로드 — diff 프리뷰 & 적용 엔진.
 *
 * 흐름 (CLAUDE_CODE_PROMPT §5-1):
 *   업로드 → 컬럼 매핑 → 🔴 diff 프리뷰 → 확정
 * 신규 버전 생성시 effective_from 지정 → 기존행 effective_to 자동 마감.
 *
 * 🔴 "마진 -0.7%p" 같은 실제 마진 영향은 계산엔진(Phase 1-B) 완성 후 연결.
 *    현재는 정직하게 "영향 SKU 수" + "요율 변화(%p)" 까지만 계산.
 */

export type ImportTable = "fee_category" | "fee_logistics";

export type DiffFieldChange = {
  field: string;
  before: string | null;
  after: string | null;
};

export type DiffRow = {
  status: "added" | "changed" | "unchanged";
  keyLabel: string;
  changes: DiffFieldChange[];
  affectedSkuCount: number;
  currentId?: number;
};

export type DiffResult = {
  table: ImportTable;
  effectiveFrom: string;
  rows: DiffRow[];
  summary: { added: number; changed: number; unchanged: number; affectedSku: number };
};

/* ---- 테이블별 매핑 정의 ---- */
type CategoryInput = {
  major: string;
  middle?: string | null;
  minor?: string | null;
  commission_rate: string;
  service_fee_threshold?: string | null;
};
type LogisticsInput = {
  size_type: string;
  category_group?: string | null;
  price_min?: string | null;
  price_max?: string | null;
  inbound_fee: string;
  shipping_fee: string;
};

const norm = (v: unknown) =>
  v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim();

function categoryKey(r: { major: string; middle: string | null; minor: string | null }) {
  return `${r.major} > ${r.middle ?? "-"} > ${r.minor ?? "-"}`;
}
function logisticsKey(r: {
  sizeType: string;
  categoryGroup: string | null;
  priceMin: number | null;
  priceMax: number | null;
}) {
  const range =
    r.priceMin === null && r.priceMax === null
      ? "전체가격"
      : `${r.priceMin ?? 0}~${r.priceMax ?? "∞"}`;
  return `${r.sizeType} / ${r.categoryGroup ?? "전체"} / ${range}`;
}

/* ---------------------------- diff 계산 ---------------------------- */
export async function computeDiff(
  table: ImportTable,
  rawRows: Record<string, unknown>[],
  effectiveFrom: string
): Promise<DiffResult> {
  if (table === "fee_category") return diffCategory(rawRows as CategoryInput[], effectiveFrom);
  return diffLogistics(rawRows as LogisticsInput[], effectiveFrom);
}

async function diffCategory(rows: CategoryInput[], effectiveFrom: string): Promise<DiffResult> {
  // 현재 유효(effective_to IS NULL) 카테고리
  const current = await db
    .select()
    .from(schema.feeCategory)
    .where(isNull(schema.feeCategory.effectiveTo));
  const byKey = new Map(current.map((c) => [categoryKey(c), c]));

  const out: DiffRow[] = [];
  for (const r of rows) {
    const major = norm(r.major);
    if (!major) continue;
    const middle = norm(r.middle);
    const minor = norm(r.minor);
    const key = categoryKey({ major, middle, minor });
    const rate = norm(r.commission_rate);
    const threshold = norm(r.service_fee_threshold);
    const cur = byKey.get(key);

    // 영향 SKU 수
    let affected = 0;
    if (cur) {
      const [c] = await db
        .select({ n: count() })
        .from(schema.product)
        .where(eq(schema.product.categoryId, cur.id));
      affected = c.n;
    }

    if (!cur) {
      out.push({
        status: "added",
        keyLabel: key,
        affectedSkuCount: 0,
        changes: [
          { field: "commission_rate", before: null, after: rate },
          ...(threshold ? [{ field: "service_fee_threshold", before: null, after: threshold }] : []),
        ],
      });
      continue;
    }

    const changes: DiffFieldChange[] = [];
    if (norm(cur.commissionRate) !== rate) {
      changes.push({ field: "commission_rate", before: String(cur.commissionRate), after: rate });
    }
    if (threshold !== null && String(cur.serviceFeeThreshold ?? "") !== threshold) {
      changes.push({
        field: "service_fee_threshold",
        before: cur.serviceFeeThreshold === null ? null : String(cur.serviceFeeThreshold),
        after: threshold,
      });
    }
    out.push({
      status: changes.length ? "changed" : "unchanged",
      keyLabel: key,
      changes,
      affectedSkuCount: changes.length ? affected : 0,
      currentId: cur.id,
    });
  }
  return summarize("fee_category", effectiveFrom, out);
}

async function diffLogistics(rows: LogisticsInput[], effectiveFrom: string): Promise<DiffResult> {
  const current = await db
    .select()
    .from(schema.feeLogistics)
    .where(isNull(schema.feeLogistics.effectiveTo));
  const byKey = new Map(current.map((c) => [logisticsKey(c), c]));

  const out: DiffRow[] = [];
  for (const r of rows) {
    const sizeType = norm(r.size_type);
    if (!sizeType) continue;
    const categoryGroup = norm(r.category_group);
    const priceMin = norm(r.price_min) === null ? null : Number(r.price_min);
    const priceMax = norm(r.price_max) === null ? null : Number(r.price_max);
    const inbound = norm(r.inbound_fee);
    const shipping = norm(r.shipping_fee);
    const key = logisticsKey({ sizeType, categoryGroup, priceMin, priceMax });
    const cur = byKey.get(key);

    // 해당 사이즈 SKU 수 (캐시된 size_type_cached 기준)
    const [c] = await db
      .select({ n: count() })
      .from(schema.product)
      .where(eq(schema.product.sizeTypeCached, sizeType as never));
    const affected = c.n;

    if (!cur) {
      out.push({
        status: "added",
        keyLabel: key,
        affectedSkuCount: 0,
        changes: [
          { field: "inbound_fee", before: null, after: inbound },
          { field: "shipping_fee", before: null, after: shipping },
        ],
      });
      continue;
    }
    const changes: DiffFieldChange[] = [];
    if (String(cur.inboundFee) !== inbound)
      changes.push({ field: "inbound_fee", before: String(cur.inboundFee), after: inbound });
    if (String(cur.shippingFee) !== shipping)
      changes.push({ field: "shipping_fee", before: String(cur.shippingFee), after: shipping });
    out.push({
      status: changes.length ? "changed" : "unchanged",
      keyLabel: key,
      changes,
      affectedSkuCount: changes.length ? affected : 0,
      currentId: cur.id,
    });
  }
  return summarize("fee_logistics", effectiveFrom, out);
}

function summarize(table: ImportTable, effectiveFrom: string, rows: DiffRow[]): DiffResult {
  return {
    table,
    effectiveFrom,
    rows,
    summary: {
      added: rows.filter((r) => r.status === "added").length,
      changed: rows.filter((r) => r.status === "changed").length,
      unchanged: rows.filter((r) => r.status === "unchanged").length,
      affectedSku: rows.reduce((a, r) => a + r.affectedSkuCount, 0),
    },
  };
}

/* ---------------------------- 적용 ---------------------------- */
export async function applyImport(
  table: ImportTable,
  rawRows: Record<string, unknown>[],
  effectiveFrom: string,
  markVerified: boolean
): Promise<{ closed: number; inserted: number }> {
  const diff = await computeDiff(table, rawRows, effectiveFrom);
  const changing = diff.rows.filter((r) => r.status === "added" || r.status === "changed");
  const closeDate = prevDay(effectiveFrom);
  let closed = 0;
  let inserted = 0;

  if (table === "fee_category") {
    const rows = rawRows as CategoryInput[];
    for (const dr of changing) {
      const src = rows.find((r) => categoryKey({
        major: norm(r.major)!,
        middle: norm(r.middle),
        minor: norm(r.minor),
      }) === dr.keyLabel);
      if (!src) continue;
      if (dr.currentId) {
        await db
          .update(schema.feeCategory)
          .set({ effectiveTo: closeDate })
          .where(and(eq(schema.feeCategory.id, dr.currentId), isNull(schema.feeCategory.effectiveTo)));
        closed++;
      }
      const major = norm(src.major)!;
      await db.insert(schema.feeCategory).values({
        major,
        middle: norm(src.middle),
        minor: norm(src.minor),
        commissionRate: norm(src.commission_rate)!,
        isDefault: !norm(src.middle) && !norm(src.minor),
        rgEligible: !["식품", "음반", "도서"].includes(major),
        serviceFeeThreshold: norm(src.service_fee_threshold)
          ? Number(src.service_fee_threshold)
          : null,
        effectiveFrom,
        isVerified: markVerified,
        source: "import",
      });
      inserted++;
    }
  } else {
    const rows = rawRows as LogisticsInput[];
    for (const dr of changing) {
      const src = rows.find((r) => {
        const pMin = norm(r.price_min) === null ? null : Number(r.price_min);
        const pMax = norm(r.price_max) === null ? null : Number(r.price_max);
        return (
          logisticsKey({
            sizeType: norm(r.size_type)!,
            categoryGroup: norm(r.category_group),
            priceMin: pMin,
            priceMax: pMax,
          }) === dr.keyLabel
        );
      });
      if (!src) continue;
      if (dr.currentId) {
        await db
          .update(schema.feeLogistics)
          .set({ effectiveTo: closeDate })
          .where(and(eq(schema.feeLogistics.id, dr.currentId), isNull(schema.feeLogistics.effectiveTo)));
        closed++;
      }
      await db.insert(schema.feeLogistics).values({
        sizeType: norm(src.size_type) as never,
        categoryGroup: norm(src.category_group),
        priceMin: norm(src.price_min) ? Number(src.price_min) : null,
        priceMax: norm(src.price_max) ? Number(src.price_max) : null,
        inboundFee: Number(src.inbound_fee),
        shippingFee: Number(src.shipping_fee),
        effectiveFrom,
        isVerified: markVerified,
        source: "import",
      });
      inserted++;
    }
  }
  void todayIso; // (예약: 향후 기본 effectiveFrom)
  return { closed, inserted };
}
