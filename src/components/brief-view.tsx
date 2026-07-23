import { Badge } from "@/components/ui/badge";

export type Brief = {
  keyword: string;
  verdict: "GO" | "조건부" | "SKIP";
  demand?: string;
  buyerNeed?: string;
  painPoints?: string[];
  differentiation?: string[];
  competition?: string;
  risk?: string;
  margin?: string;
  howToWin?: string;
};

export function verdictStyle(v: Brief["verdict"]) {
  return v === "GO"
    ? { label: "GO 추천", variant: "go" as const }
    : v === "SKIP"
      ? { label: "SKIP", variant: "nogo" as const }
      : { label: "조건부", variant: "caution" as const };
}

/** 업로드/저장된 기회분석 JSON → Brief 정규화 */
export function parseBrief(text: string): Brief | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0) return null;
  const o = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  const kw = typeof o.keyword === "string" ? o.keyword : "";
  if (!kw) return null;
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined);
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const verdict = o.verdict === "GO" || o.verdict === "조건부" || o.verdict === "SKIP" ? o.verdict : "조건부";
  return {
    keyword: kw,
    verdict: verdict as Brief["verdict"],
    demand: str(o.demand),
    buyerNeed: str(o.buyerNeed),
    painPoints: arr(o.painPoints),
    differentiation: arr(o.differentiation),
    competition: str(o.competition),
    risk: str(o.risk),
    margin: str(o.margin),
    howToWin: str(o.howToWin),
  };
}

export function BriefView({ b, showKeyword = true }: { b: Brief; showKeyword?: boolean }) {
  const v = verdictStyle(b.verdict);
  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
      {showKeyword && (
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold">{b.keyword}</span>
          <Badge variant={v.variant}>{v.label}</Badge>
        </div>
      )}
      {b.howToWin && (
        <div className="rounded-lg bg-primary/10 px-3 py-2 text-sm font-semibold text-primary">💡 {b.howToWin}</div>
      )}
      {b.buyerNeed && <BriefRow label="구매 욕구" text={b.buyerNeed} />}
      {b.painPoints && b.painPoints.length > 0 && <BriefList label="미충족 니즈" items={b.painPoints} />}
      {b.differentiation && b.differentiation.length > 0 && <BriefList label="차별화 각도" items={b.differentiation} />}
      {b.demand && <BriefRow label="수요" text={b.demand} />}
      {b.competition && <BriefRow label="진입 난이도" text={b.competition} />}
      {b.margin && <BriefRow label="마진" text={b.margin} />}
      {b.risk && <BriefRow label="리스크" text={b.risk} />}
    </div>
  );
}

function BriefRow({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="text-sm">{text}</p>
    </div>
  );
}

function BriefList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <ul className="mt-0.5 space-y-0.5 text-sm">
        {items.map((it, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="text-primary">·</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
