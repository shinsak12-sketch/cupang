import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const TEMPLATES: Record<string, string> = {
  fee_category:
    "major,middle,minor,commission_rate,service_fee_threshold\n패션,패션잡화,,10.5,1000000\n",
  fee_logistics:
    "size_type,category_group,price_min,price_max,inbound_fee,shipping_fee\nXS,,,,600,1350\n",
};

// GET /api/fees/template?table=fee_category — CSV 템플릿 다운로드
export function GET(req: NextRequest) {
  const table = req.nextUrl.searchParams.get("table") ?? "fee_category";
  const csv = TEMPLATES[table] ?? TEMPLATES.fee_category;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${table}_template.csv"`,
    },
  });
}
