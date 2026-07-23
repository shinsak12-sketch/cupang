import { NextRequest, NextResponse } from "next/server";
import { getVolumes, naverConfigured } from "@/lib/naver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 대분류별 대표 세부 키워드의 실제 월검색량(네이버 검색광고).
 * 🔴 하위 cat_id 매핑 대신 큐레이션 키워드 사용 → 값이 더 정확하고 바로 조사 가능.
 * 쿠팡 하위분류와 비슷하게 구성. (parent = 네이버쇼핑 대분류 cid)
 */
const SUBKEYWORDS: Record<string, string[]> = {
  "50000000": ["여성 원피스", "남성 반팔티", "트레이닝복", "니트", "청바지", "맨투맨", "레깅스"], // 패션의류
  "50000001": ["여성 가방", "백팩", "운동화", "지갑", "벨트", "모자", "선글라스"], // 패션잡화
  "50000002": ["선크림", "쿠션", "클렌징오일", "마스크팩", "립밤", "헤어오일", "네일"], // 화장품/미용
  "50000003": ["무선이어폰", "보조배터리", "블루투스 스피커", "충전기", "스마트워치", "USB허브"], // 디지털/가전
  "50000004": ["수납장", "이불", "커튼", "무드등", "행거", "러그", "선반"], // 가구/인테리어
  "50000005": ["기저귀", "아기물티슈", "유아 식판", "젖병", "아기 욕조", "치발기"], // 출산/육아
  "50000006": ["닭가슴살", "견과류", "곤약젤리", "프로틴", "단백질바", "다이어트 도시락"], // 식품
  "50000007": ["요가매트", "등산스틱", "캠핑의자", "폼롤러", "헬스장갑", "아이스박스"], // 스포츠/레저
  "50000008": ["실리콘 수세미", "칫솔", "마스크", "손소독제", "영양제", "배변패드", "제습제"], // 생활/건강
  "50000009": ["차량용 방향제", "우산", "여행용 파우치", "휴대폰 거치대", "목베개", "보조가방"], // 여가/생활편의
};

export async function GET(req: NextRequest) {
  const parent = (req.nextUrl.searchParams.get("parent") ?? "").trim();
  const kws = SUBKEYWORDS[parent];
  if (!kws) return NextResponse.json({ items: [] });
  if (!naverConfigured()) {
    return NextResponse.json(
      { error: "네이버 검색광고 키 미설정 (NAVER_API_KEY/SECRET/CUSTOMER_ID)" },
      { status: 500 }
    );
  }
  try {
    const m = await getVolumes(kws);
    const items = kws
      .map((k) => {
        const v = m.get(k);
        return { keyword: k, total: v ? v.total : null, comp: v ? v.comp : null };
      })
      .sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json(
      { error: `검색량 조회 실패: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }
}
