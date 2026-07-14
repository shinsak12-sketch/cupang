import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { computeDiff, applyImport, type ImportTable } from "@/lib/fee-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  table: z.enum(["fee_category", "fee_logistics"]),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rows: z.array(z.record(z.string(), z.unknown())).min(1),
  markVerified: z.boolean().optional().default(true),
});

// POST /api/fees/import?mode=preview|apply
export async function POST(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("mode") ?? "preview";
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { table, effectiveFrom, rows, markVerified } = parsed.data;

  try {
    if (mode === "apply") {
      const result = await applyImport(
        table as ImportTable,
        rows,
        effectiveFrom,
        markVerified
      );
      return NextResponse.json({ ok: true, ...result });
    }
    const diff = await computeDiff(table as ImportTable, rows, effectiveFrom);
    return NextResponse.json({ ok: true, diff });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
