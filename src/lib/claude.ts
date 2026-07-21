import Anthropic from "@anthropic-ai/sdk";
import { getVolumes, naverConfigured, type KeywordStat } from "@/lib/naver";

const MODEL = "claude-opus-4-8";

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
개인 셀러(1인)가 마진 좋은 상품군을 찾도록 돕습니다. 반드시 한국어로 답합니다.

핵심 원칙:
- 저단가 상품은 물류비(입출고비)·해외배송비 비중이 커서 마진이 무너지기 쉽다. 판매가 대비 원가+물류 구조를 항상 고려.
- 쿠팡 PB(코멧 등)가 이미 장악한 카테고리는 가격경쟁이 불가능하니 피한다.
- 세트 구성/묶음으로 객단가를 올릴 수 있는 상품이 유리.
- 반품 시 위생 리스크(속옷·식품 접촉 등)나 파손 리스크가 큰 품목은 주의.
- 계절/프로모션 절벽(신규 90일 후 노출 급감)을 고려.
- 표준화되어 리뷰 경쟁이 이미 과열된 레드오션은 신규 진입이 어렵다.

개인 셀러 관점에서 현실적이고 구체적으로 판단하세요.`;

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
요청: "${request || "1688에서 소싱해서 쿠팡에 팔기 좋은, 경쟁이 덜하고 마진 나오는 상품군"}"

각 키워드는 실제로 소비자가 쿠팡/네이버에서 검색할 법한 구체적인 상품명이어야 합니다.
(너무 넓은 "양말" 보다 "발가락 등산양말" 처럼 구체적으로)

JSON 배열로만 답하세요. 다른 설명 없이:
[{"keyword":"키워드","reason":"이걸 고른 이유(한 문장)"}]`;

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
개인 셀러(1688→쿠팡)에게 유리한 순서로 상위 8개를 골라 평가하세요.

검색량이 너무 낮으면(수요 부족) 또는 너무 높은데 경쟁 극심하면 낮게 평가하세요.
검색량 "미상"은 네이버 데이터가 없는 것이니 수요를 낮게 가정하세요.

데이터:
${volLines}

JSON 배열로만 답하세요:
[{"keyword":"키워드","verdict":"GOOD|OKAY|AVOID","reason":"추천 이유(한두 문장)","caution":"주의점(한 문장)"}]
verdict 기준: GOOD=적극추천, OKAY=검토가치, AVOID=비추천(이유 명시).`;

  const rankText = await ask(client, rankPrompt);
  let ranked: Array<{ keyword: string; verdict: string; reason: string; caution: string }> = [];
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
      return {
        keyword: r.keyword,
        verdict: verdict as Recommendation["verdict"],
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
