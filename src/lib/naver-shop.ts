/**
 * 네이버 쇼핑 검색 API (openapi.naver.com/v1/search/shop).
 * 🔴 DataLab(API Hub)·검색광고와 또 다른 키: developers.naver.com 앱의 Client ID/Secret.
 * env: NAVER_SEARCH_ID, NAVER_SEARCH_SECRET
 * 키워드의 시장 상품 수 + 최저/대표(중앙값) 가격 → 판매가 벤치마크.
 */
const SHOP_URL = "https://openapi.naver.com/v1/search/shop.json";

export function shopConfigured(): boolean {
  return !!(process.env.NAVER_SEARCH_ID && process.env.NAVER_SEARCH_SECRET);
}

export type ShopItem = { title: string; price: number; mall: string; link: string };
export type ShopResult = {
  total: number;
  min: number | null;
  max: number | null;
  median: number | null;
  items: ShopItem[];
};

const strip = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export async function shopSearch(query: string): Promise<ShopResult | null> {
  const id = process.env.NAVER_SEARCH_ID;
  const secret = process.env.NAVER_SEARCH_SECRET;
  if (!id || !secret) return null;

  const url = `${SHOP_URL}?query=${encodeURIComponent(query)}&display=40&sort=sim`;
  const r = await fetch(url, {
    headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret },
  });
  if (!r.ok) {
    const b = await r.text().catch(() => "");
    throw new Error(`쇼핑검색 오류 ${r.status}: ${b.slice(0, 160)}`);
  }
  const j = (await r.json()) as {
    total?: number;
    items?: Array<{ title?: string; lprice?: string; mallName?: string; link?: string }>;
  };

  const items: ShopItem[] = (j.items ?? [])
    .map((it) => ({
      title: strip(it.title ?? ""),
      price: parseInt(it.lprice ?? "0", 10) || 0,
      mall: it.mallName ?? "",
      link: it.link ?? "",
    }))
    .filter((x) => x.price > 0);

  const prices = items.map((i) => i.price).sort((a, b) => a - b);
  const median = prices.length ? prices[Math.floor(prices.length / 2)] : null;

  return {
    total: j.total ?? 0,
    min: prices[0] ?? null,
    max: prices[prices.length - 1] ?? null,
    median,
    items: [...items].sort((a, b) => a.price - b.price).slice(0, 5),
  };
}
