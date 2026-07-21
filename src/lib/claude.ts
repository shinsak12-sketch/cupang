import Anthropic from "@anthropic-ai/sdk";
import { getVolumes, naverConfigured, type KeywordStat } from "@/lib/naver";

const MODEL = "claude-haiku-4-5";

export function claudeConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export type Candidate = {
  keyword: string;
  reason: string;
};

export type Recommendation = {
  keyword: string;
  verdict: "GOOD" | "OKAY" | "AVOID";
  margin: "상" | "중" | "하" | null;
  reason: string;
  caution: string;
  monthlyVolume: number | null;
  comp: string | null;
};

export type DiscoverResult = {
  ask: string;
  recommendations: Recommendation[];
  note: string;
};

const SYSTEM = `당신은 1688(중국 도매) 소싱 → 쿠팡 로켓그로스 판매 전문가입니다.
개인 셀러(1인)에게 "실제로 돈이 되는" 상품군을 찾아줍니다. 반드시 한국어로 답합니다.

최우선 판단 기준은 딱 두 가지입니다:
1) 수요 — 사람들이 실제로 많이 검색하는 상품이어야 한다. 검색량이 저조한 틈새는 경쟁이 없어도 진입 가치가 없다.
2) 마진율 — 이게 가장 중요하다. 1688 사입원가 + 해외배송/입출고비 + 쿠팡 수수료를 다 빼고도 마진이 남아야 한다. 판매가 대비 원가가 낮아 마진 여력이 큰 상품을 최우선으로.

태도:
- 레드오션(경쟁 과열)이라는 이유만으로 배제하지 마라. 수요가 크고 마진이 남으면 경쟁이 치열해도 진입 가치가 있다.
- 누구나 바로 떠올리는 "너무 뻔한 대표 키워드"만 나열하지 마라. 수요는 크되 마진 구조가 살아있는 지점을 찾아라.
- 저단가 상품일수록 물류비 비중이 커 마진이 무너지기 쉬우니 마진 여력을 냉정하게 본다.
- 세트/묶음으로 객단가를 올릴 수 있으면 마진에 유리.
- 쿠팡 PB(코멧 등)가 원가 이하로 후려치는 구역은 '마진이 안 나오니' 감점 (레드오션이라서가 아니라 마진 때문).
- 반품 위생/파손 리스크, 시즌 절벽은 참고로만 언급.

수요 × 마진, 이 두 축으로 현실적이고 구체적으로 판단하세요.`;

function extractJson(text: string): unknown {
  // ```json ... ``` 또는 첫 { / [ ~ 마지막 } / ] 사이 파싱
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text;
  const start = raw.search(/[[{]/);
  if (start < 0) throw new Error("JSON을 찾을 수 없습니다");
  const lastBrace = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
  const slice = raw.slice(start, lastBrace + 1);
  return JSON.parse(slice);
}

async function ask(client: Anthropic, prompt: string): Promise<string> {
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

/**
 * Claude가 상품군을 발굴 → 네이버 검색량으로 보강 → Claude가 랭킹.
 */
export async function discoverProducts(request: string): Promise<DiscoverResult> {
  if (!claudeConfigured()) throw new Error("ANTHROPIC_API_KEY 미설정");
  const client = new Anthropic();

  // 1) 후보 키워드 생성
  const genPrompt = `아래 요청에 맞는 쿠팡 판매 후보 상품 키워드를 15개 제안하세요.
요청: "${request || "1688에서 소싱해서 쿠팡에 팔기 좋은, 수요가 크면서 마진 여력이 남는 상품군"}"

선정 기준(중요도 순):
1) 사람들이 실제로 많이 검색하는(수요 있는) 상품일 것. 검색량 저조한 초틈새는 제외.
2) 1688 사입원가가 낮아 마진 여력이 큰 상품 우선. (원가↓, 판매가 방어 가능, 세트화 가능)
3) 레드오션이어도 마진이 남으면 포함. 단, 누구나 떠올리는 뻔한 대표 키워드만 나열하지 말 것.
4) 소비자가 실제로 검색할 구체적 상품명. (넓은 "양말"보다 "발가락 등산양말")

JSON 배열로만 답하세요. 다른 설명 없이:
[{"keyword":"키워드","reason":"수요·마진 관점 선정 이유(한 문장)"}]`;

  const genText = await ask(client, genPrompt);
  let candidates: Candidate[] = [];
  try {
    const parsed = extractJson(genText) as Candidate[];
    candidates = parsed.filter((c) => c && typeof c.keyword === "string").slice(0, 15);
  } catch {
    throw new Error("Claude 후보 생성 응답 파싱 실패");
  }
  if (candidates.length === 0) throw new Error("후보 키워드가 비어 있습니다");

  // 2) 네이버 검색량 보강 (가능한 경우)
  let volumes = new Map<string, KeywordStat>();
  if (naverConfigured()) {
    try {
      volumes = await getVolumes(candidates.map((c) => c.keyword));
    } catch {
      // 검색량 없이도 진행
    }
  }

  const withVol = candidates.map((c) => {
    const v = volumes.get(c.keyword);
    return { ...c, monthlyVolume: v ? v.total : null, comp: v ? v.comp : null };
  });

  // 3) Claude 랭킹 + 최종 추천
  const volLines = withVol
    .map(
      (c) =>
        `- ${c.keyword} | 월검색량 ${c.monthlyVolume ?? "미상"} | 경쟁 ${c.comp ?? "미상"} | 후보이유: ${c.reason}`
    )
    .join("\n");

  const rankPrompt = `아래는 후보 상품 키워드와 네이버 월간 검색량 데이터입니다.
"수요(검색량) × 마진 여력" 두 축으로 상위 8개를 골라 평가하세요.

랭킹 원칙:
1) 검색량이 충분히 높아야 한다(수요). 검색량이 너무 낮으면(예: 월 수백 이하) 진입 가치 없음 → AVOID.
2) 마진 여력이 가장 중요하다. 1688 저원가 사입 + 판매가 방어 + 세트화로 마진이 남을지 냉정히 평가.
3) 레드오션·경쟁 과열은 그 자체로 감점하지 마라. 수요 크고 마진 남으면 GOOD 가능.
4) 검색량 "미상"은 네이버 데이터가 없는 것 → 수요 불확실로 보수적 평가.

데이터:
${volLines}

JSON 배열로만 답하세요:
[{"keyword":"키워드","verdict":"GOOD|OKAY|AVOID","margin":"상|중|하","reason":"수요·마진 근거(한두 문장)","caution":"주의점(한 문장)"}]
verdict: GOOD=수요 충분+마진 여력 큼, OKAY=한쪽만 충족/검토가치, AVOID=수요 저조 또는 마진 안 남음(이유 명시).
margin: 상=마진 여력 큼, 중=보통, 하=박함.`;

  const rankText = await ask(client, rankPrompt);
  let ranked: Array<{ keyword: string; verdict: string; margin?: string; reason: string; caution: string }> = [];
  try {
    ranked = extractJson(rankText) as typeof ranked;
  } catch {
    throw new Error("Claude 랭킹 응답 파싱 실패");
  }

  const volByKw = new Map(withVol.map((c) => [c.keyword.replace(/\s+/g, ""), c]));
  const recommendations: Recommendation[] = ranked
    .filter((r) => r && typeof r.keyword === "string")
    .map((r) => {
      const v = volByKw.get(r.keyword.replace(/\s+/g, ""));
      const verdict = ["GOOD", "OKAY", "AVOID"].includes(r.verdict) ? r.verdict : "OKAY";
      const margin = ["상", "중", "하"].includes(r.margin ?? "") ? (r.margin as "상" | "중" | "하") : null;
      return {
        keyword: r.keyword,
        verdict: verdict as Recommendation["verdict"],
        margin,
        reason: r.reason ?? "",
        caution: r.caution ?? "",
        monthlyVolume: v ? v.monthlyVolume : null,
        comp: v ? v.comp : null,
      };
    });

  return {
    ask: request,
    recommendations,
    note: naverConfigured()
      ? "Claude 발굴 + 네이버 검색량 보강. 검색량·판단은 참고용 추정입니다."
      : "Claude 발굴(네이버 검색량 미설정). 실제 검색량으로 재검증하세요.",
  };
}
