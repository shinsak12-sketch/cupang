# 로켓그로스 수익계산 프로그램 구현 요청

## 0. 프로젝트 개요

1688에서 사입해 쿠팡 로켓그로스로 판매하는 **개인 셀러용** 수익 계산·관리 웹앱을 만든다.

**핵심 목적:** "이 상품 팔면 최종 얼마 남는가"를 판정한다. 사용자는 아직 판매 경험이 없다. 따라서 이 앱의 실질적 목표는 **"팔면 안 되는 상품을 걸러내는 것"** 이며, 나중에 실적이 쌓이면 추정치를 실측으로 교정하는 것이다.

**절대 원칙 (이거 어기면 앱이 무의미해짐):**
1. **단일 마진 숫자를 보여주지 말 것.** 항상 낙관/기준/비관 3시나리오 병렬 표시.
2. **수수료·요율을 코드에 하드코딩 금지.** 전부 DB 테이블 + 유효기간(effective_from/to) 버전 관리. 과거 로트는 그 시점 요율로 재계산되어야 함.
3. **모든 수치에 `is_verified` / `is_estimate` 플래그.** 추정치는 UI에서 시각적으로 구분 표시. 사용자가 추정을 사실로 착각하면 안 됨.
4. **계산 엔진은 순수 함수로 UI와 완전 분리.** `/lib/calc/` 하위. 유닛테스트 필수.
5. 모든 계산 함수는 `asOfDate`를 인자로 받아 해당 시점 유효 요율로 계산.

---

## 1. 기술 스택 (확정)

| 레이어 | 선택 |
|---|---|
| 프레임워크 | Next.js 15 (App Router, TypeScript) |
| DB | Neon (Postgres) — serverless driver |
| ORM | Drizzle ORM + drizzle-kit |
| 배포 | Vercel |
| UI | Tailwind CSS + shadcn/ui |
| 폼/검증 | react-hook-form + zod |
| 서버상태 | TanStack Query |
| 차트 | Recharts |
| 엑셀 파싱 | SheetJS (xlsx) |
| 테스트 | Vitest |
| 인증 | Next.js middleware Basic Auth |

**환경변수:**
```
DATABASE_URL=            # Neon
BASIC_AUTH_USER=
BASIC_AUTH_PASS=
INGEST_TOKEN=            # 북마클릿 전용 시크릿
```

**인증 규칙:**
- `middleware.ts`에서 전 경로 Basic Auth
- **단 `/api/ingest`는 제외** — 북마클릿이 호출하므로 Basic Auth 불가. 대신 `?token=INGEST_TOKEN` 검증 + CORS 허용(`https://*.1688.com`)

---

## 2. 도메인 지식 (반드시 정확히 반영)

### 2-1. 비용 구조 전체

**A. 사입 (1688 → 중국창고)**
```
제품구매비용 = (제품금액 + 중국내배송비) × (1 + 대행수수료율) × 적용환율
```
- 대행수수료: 업체별 0~5% (결제대행만 쓰면 0%인 업체도 있음)
- 카드결제시 별도 3% 가능
- 검수/포장/바코드부착비 (로켓그로스는 바코드 필수 → 중국 현지 부착이 저렴)

**B. 국제운송 — 3모드 선택 변수**
| 모드 | 단가 감각 |
|---|---|
| 특송(항공) | kg당 3,800원~ |
| LCL 해운 | 건당 65,000원~ + CBM 요율 |
| FCL | 컨테이너 단위 |

**부피무게 vs 실중량 — 큰 값으로 과금:**
- 항공 부피무게(kg) = (W×D×H cm) / 6000
- 해운은 CBM(m³) 기준

**C. 통관 (사업자 정식통관)**
```
과세표준(CIF) = (상품가 + 중국내배송 + 국제운임 + 보험) × 관세청 고시환율
관세          = 과세표준 × 관세율
수입부가세     = (과세표준 + 관세) × 10%
```
부대비용: 통관수수료 특송 16,500 / 해운 33,000, B/L 19,000, 핸들링 33,000, 국내배송비

**🔴 핵심 함정 2개:**
1. **수입부가세는 원가가 아님.** 일반과세자는 매입세액 공제됨. 원가에 넣으면 마진 과소계산. → `vatCreditEnabled` 토글 필수, 기본 ON
2. **목록통관 $150 면세는 개인 자가사용 한정.** 사업자 정식통관은 금액 무관 과세 → 면세 로직 넣지 말 것

**인증비(일회성):** KC/전파/어린이제품/화평법 등. `cert_cost_total ÷ cert_expected_qty`로 개당 배분

### 2-2. 쿠팡 로켓그로스 비용 (2026-07 기준)

**① 판매수수료** — 카테고리별 4.0~10.9%. 결제수수료는 별도 없고 이 안에 포함.
- 기준: **판매자 할인쿠폰(즉시할인/다운로드쿠폰) 적용 후 최종 소비자 결제가**
- 유료배송시 배송비에만 3.3% 결제수수료 별도

**② 입출고비 + 배송비 (사이즈 6단계)** — 공식 하한값:
| 사이즈 | 입출고비 | 배송비 |
|---|---|---|
| XS 극소형 | 600원~ | 1,350원~ |
| S 소형 | 650원~ | 1,550원~ |
| M 중형 | 1,250원~ | 2,100원~ |
| L1 대형1 | 1,375원~ | 2,200원~ |
| L2 대형2 | 1,375원~ | 4,100원~ |
| XL 특대형 | 1,375원~ | 5,600원~ |

🔴 실제 요금은 **카테고리 × 사이즈유형 × 판매가** 3중 매트릭스로 결정됨. 위는 하한값 플레이스홀더. 웹에서 확보 불가(윙 로그인 필요) → **사용자가 나중에 업로드**하는 구조로 설계.

**③ 사이즈 판정:** (W+D+H) 합산값과 실제 무게 중 **더 높은 기준** 적용. 포장재 포함 기준.
- 로켓그로스 등록 불가: 3변합 250cm 초과 or 30kg 초과

**④ 보관비** — 매 입고시 30일 무료. **의류/신발/악세서리는 45일**. 이후 일할 부과.

**⑤ 반품 3종** — 회수비(월 20건 무료, 상품당 — 동일상품 여러개 반품돼도 1회만), 재입고비(월 20개 무료, 수량당), 반출비(월 20개 무료, 수량당)

**⑥ 로켓그로스 세이버** — 보관 60일 무료 + 반품회수비 무제한 무료 + 반품재입고비 무제한 무료. (반출비는 월 20개 무료 유지)

**⑦ 🔴 신규 90일 프로모션 (현재 진행중, 사용자 해당)**
- 첫 판매 개시 후 90일간 입출고비·배송비 0원
- 보관비 최대 90일 무료, 반품회수/재입고/반출비 무료
- **캡: 90일 또는 누적매출 2억원 도달시까지**
- 신청기간 2026.07.01~07.31

**⑧ 월 서비스 이용료** — 월매출 100만원 초과시 55,000원(VAT포함). 가전디지털은 500만원.

**⑨ 광고비** — CPC. `광고비 = 매출 ÷ ROAS` 또는 광고비율 직접입력

**⑩ 🔴 쿠팡 모든 수수료·물류비는 VAT 별도.** 단 이 매입VAT도 공제 대상.

### 2-3. 세금
```
매출세액 = 판매가 × 10/110
매입세액 = 수입VAT + 쿠팡수수료VAT + 물류비VAT + 광고비VAT + 대행수수료VAT
납부부가세 = 매출세액 − 매입세액
```
마진 계산시 매출은 **VAT 제외** 기준. 소득세/법인세는 "세전이익"까지만 내고 세율은 옵션 입력.

### 2-4. 첫 상품: 양말 (프로파일 시딩용)

- 카테고리: 패션 > 패션잡화, **10.5%**. (스포츠양말로 등록해도 스포츠의류 10.5% — 카테고리로 절감 여지 없음)
- 보관비 **45일 무료** 대상 (의류/악세서리군)
- HS 6115류 추정, 관세율 13% 가정 → **미검증**. 한중FTA C/O 있으면 인하 가능
- 성인 양말은 KC 대상 아님. 유아용(36개월 이하)은 어린이제품 안전확인 대상

**🔴 양말 특유의 함정 (앱이 반드시 경고해야 함):**
1. **19,800원 무료배송 경계** — 로켓그로스 무료배송은 최종결제 19,800원 이상. 양말 단품은 못 넘김 → **단품은 상품으로 성립 불가**. 반드시 세트 구성.
2. **세트하면 사이즈 등급 상승** — 단품 XS(600/1350) → 10족이면 S/M. 배송비 2,100원까지. 최적 족수 찾기가 핵심 의사결정.
3. **반품 = 원가 전손** — 위생상 재판매 불가. 반품률 8%면 원가 8%가 통째 증발 + 회수비 + 폐기비.
4. **저단가 = 물류비 비중 폭증** — 10,000원 상품에 물류비 1,950원이면 19.5%. 수수료 10.5% 합쳐 30%.
5. **90일 절벽** — 프로모션 중 물류비 0원. 종료시 판매가 10,000원 기준 마진 19.5%p 즉시 증발.
6. **쿠팡 PB(코멧) 정면충돌** — 가격경쟁 불가 구역.

---

## 3. DB 스키마 (Drizzle)

### 마스터 (버전관리 — 전 테이블 `effective_from`, `effective_to`, `is_verified`, `source`, `updated_at` 공통)

**`fee_category`**
```
id, major, middle, minor, commission_rate(numeric 4,2),
is_default(bool), rg_eligible(bool),      -- 식품/음반/도서는 RG 입점불가
service_fee_threshold(int),
effective_from, effective_to, is_verified, source, updated_at
```

**`fee_size_rule`** — 사이즈 판정 규칙
```
id, size_type(enum XS/S/M/L1/L2/XL),
max_dimension_sum_mm, max_weight_g,
volumetric_divisor(default 6000),
sort_order, effective_from, effective_to, is_verified, source
```
🔴 임계값은 공식문서에서 확인 불가 → **DB에서 읽어오게 구현, 절대 하드코딩 금지.** 사용자가 윙에서 확인 후 입력.

**`fee_logistics`** — 입출고비/배송비 매트릭스
```
id, size_type, category_group(nullable=전체),
price_min, price_max,                      -- 판매가 구간
inbound_fee, shipping_fee,
effective_from, effective_to, is_verified, source
```

**`fee_misc`**
```
id, fee_key, fee_name_ko,
unit(enum: per_day_per_unit/per_item/per_qty/per_month/per_case/rate),
amount(nullable), free_quota(nullable), free_days(nullable),
effective_from, effective_to, is_verified, note, source
```

**`promotion`**
```
id, promo_key, name,
waives(jsonb: 면제되는 fee_key 배열),
cap_days, cap_amount,
apply_start, apply_end,                    -- 신청 가능 기간
my_start_date,                             -- 🔴 내가 실제 시작한 날 (D-day 계산 기준)
is_active, note, source
```

**`fx_rate`**
```
id, currency, rate(numeric 10,4),
rate_type(enum: customs/agent/bank), rate_date
```

**`hs_code`**
```
id, hs_code, description, tariff_rate,
fta_applicable(bool), fta_rate(nullable),
cert_required(jsonb), note, is_verified
```

### 운영

**`product`**
```
id, name, memo, status(enum: 검토중/발주/판매중/중단),
source_url,                                -- 1688 원본 URL
source_offer_id,                           -- URL에서 파싱, unique index
source_supplier, source_snapshot(jsonb),   -- 북마클릿 수집 원문
image_url, image_urls(jsonb),

category_id -> fee_category,
hs_code_id -> hs_code,

-- 낱개 실측
unit_w_mm, unit_d_mm, unit_h_mm, unit_weight_g,
-- 🔴 포장 후 = 실제 과금 기준
pkg_w_mm, pkg_d_mm, pkg_h_mm, pkg_weight_g,
size_type_cached,

set_qty(int default 1),                    -- 세트 구성 족수
return_resalable(bool default true),       -- 🔴 false면 반품=원가 전손
cert_cost_total, cert_expected_qty,
created_at, updated_at
```

**`lot_group`** — 컨테이너 단위 공통비
```
id, name, shipping_mode, shipping_cost_total, customs_fee_total,
allocation_basis(enum: amount/cbm/weight/qty),
ship_date, created_at
```

**`lot`**
```
id, product_id, lot_group_id(nullable), lot_no,
order_qty,
unit_price_cny, cn_inland_cny,
agent_fee_rate, card_fee_rate,
fx_rate_agent, fx_rate_customs,

shipping_mode(enum: air/lcl/fcl),
shipping_cost_direct,                      -- lot_group 미사용시 직접입력
allocated_shipping_cost,                   -- 배분 결과 캐시

tariff_rate, tariff_amount,
import_vat, customs_fee, bl_fee, handling_fee,
domestic_ship_fee, inspection_fee, barcode_fee,

-- 캐시플로우
order_date, paid_date, arrive_date, inbound_date,

landed_cost_per_unit,                      -- 계산결과 캐시
calc_snapshot(jsonb),                      -- 계산 당시 전체내역
status, created_at
```

**`assumption`**
```
id, product_id(nullable), category_major(nullable),  -- 둘다 null이면 _DEFAULT
scenario(enum: optimistic/base/pessimistic),
return_rate, defect_rate, sell_through_rate,
target_roas, ad_cost_ratio(nullable),
avg_storage_days, monthly_sales_qty,
is_estimate(bool), data_source(text)
```
해석 우선순위: `product_id` 지정 > `category_major` 매칭 > `_DEFAULT`

**`price_plan`**
```
id, product_id,
list_price, coupon_amount, final_price,    -- final_price가 수수료 기준가
saver_enabled(bool), promo_applied(bool),
calc_snapshot(jsonb), is_active, created_at
```

### Phase 2 (스키마만 미리 생성)

**`settlement_upload`** — `id, filename, ym, row_count, parse_status, uploaded_at`
**`settlement_raw`** — `id, upload_id, ym, row_json(jsonb), matched_product_id`
**`sales_actual`** — `id, product_id, lot_id, ym, sold_qty, gross_revenue, returned_qty, ad_spend, settlement_amount`
**`variance`** — `id, product_id, ym, fee_key, estimated, actual, diff, diff_pct`

---

## 4. 계산 엔진 `/lib/calc/` (순수 함수, UI 의존 0, Vitest 필수)

```ts
// size.ts
resolveSize(dims: Dimensions, weightG: number, rules: SizeRule[]): {
  sizeType: SizeType
  billableWeightG: number          // max(실중량, 부피무게)
  volumetricWeightG: number
  dimSumMm: number
  isRgEligible: boolean            // 3변합 250cm / 30kg 체크
  boundaryWarnings: string[]       // 🔴 "높이 2cm 줄이면 S→XS, 배송비 200원↓"
}
```
🔴 `boundaryWarnings`는 필수 기능. 각 규칙 경계까지의 여유(mm/g)를 계산해 "얼마 줄이면 등급 하락"을 알려줌. 초보는 이 경계를 모르는데 실제로 마진을 바꿈.

```ts
// allocation.ts
allocateCommonCost(group: LotGroup, lots: Lot[], basis: AllocationBasis): Map<lotId, number>
```
🔴 배분기준 기본값 = **cbm(부피)**. 금액비례로 나누면 부피 큰 저가품 마진을 착각함. UI에서 기준 바꾸면 결과가 어떻게 달라지는지 비교 표시.

```ts
// landed.ts
calcLandedCost(lot, product, allocated, opts: { vatCreditEnabled: boolean }): {
  perUnit: number
  breakdown: CostLine[]            // 항목별 금액 + VAT공제여부
  vatCredit: number
}
```

```ts
// coupang.ts
calcCoupangFees(input: {
  finalPrice: number               // 쿠폰 적용 후
  category, sizeType, asOfDate
  saverEnabled, promoContext
  storageDays, monthlySalesQty
}, tables): {
  commission, inbound, shipping, storage,
  returnPickup, returnRestock, removal,
  serviceFeeAllocated,             // 55,000 ÷ 월판매수량
  vatOnFees, total
  appliedPromos: string[]          // 어떤 프로모션이 뭘 면제했는지
}
```

```ts
// margin.ts
calcMargin(price, landedCost, fees, assumption, product): {
  netProfit, marginRate, roi
  returnLoss                       // 🔴 return_resalable=false면 원가 전손 계산
  breakevenQty
}

// scenario.ts
calcScenarios(product, lot, pricePlan, assumptions): {
  optimistic, base, pessimistic
  verdict: 'GO' | 'CAUTION' | 'NO-GO'
}
```
🔴 판정 규칙: **비관 시나리오 순이익 < 0 이면 NO-GO.** 기준 마진율 < 15%면 CAUTION.

```ts
// cashflow.ts
calcCashflow(lot, salesForecast): {
  timeline: CashEvent[]            // 결제 → 통관 → 입고 → 판매 → 정산
  maxCashLocked: number            // 🔴 이 로트에 묶이는 현금 최대치
  recoveryDays: number             // 현금 회수 D+며칠
  cccDays: number                  // Cash Conversion Cycle
}
```
🔴 초보 실패 1순위는 마진이 아니라 현금순환. 1688결제 → 정산까지 2~3개월. 반드시 구현.

```ts
// promo.ts
comparePromoVsPost(product, price, promoContext): {
  duringPromo: MarginResult
  afterPromo: MarginResult
  cliffAmount: number              // 개당 사라지는 금액
  cliffMarginPoints: number        // 마진율 %p 하락
  daysRemaining: number
  revenueCapRemaining: number      // 2억 캡까지 남은 매출
}
```
🔴 **프로모션 마진과 종료후 마진은 항상 나란히 표시.** 초보가 가장 크게 데일 지점.

```ts
// reverse.ts
reversePrice(targetMarginRate, ...): { requiredPrice: number }
```
🔴 실사용시 "목표 마진 25% 맞추려면 얼마?"가 더 자주 쓰임.

```ts
// setopt.ts  ← 🔴 양말 때문에 추가된 핵심 기능
optimizeSetSize(product, unitDims, unitWeight, candidateQtys: number[], ...): {
  results: Array<{
    setQty, pkgDims, sizeType,
    suggestedPrice, freeShippingOk,  // 19,800원 경계 통과 여부
    inbound, shipping,
    logisticsCostPerUnit,
    marginRate, netProfit
  }>
  recommended: number
  tradeoffNote: string             // "5족→10족: 객단가↑ 개당물류비↓ 그러나 S→M으로 배송비 550원↑"
}
```
족수 늘리면 객단가↑·개당물류비↓ 이지만 사이즈 등급↑. 이 트레이드오프 최적점 탐색. 묶음상품 전반에 적용됨.

---

## 5. 화면

```
/                      대시보드 — 알림, SKU 요약
/products              SKU 목록 (테이블/필터/정렬)
/products/new          SKU 등록 (URL 붙여넣기 → offer_id 파싱)
/products/[id]         SKU 상세
  ├ 기본정보 / 사이즈 판정기 (경계경고 표시)
  ├ 로트 목록 & 착지원가
  ├ 가격 시뮬레이터 (슬라이더)
  ├ 세트 최적화기
  ├ 3시나리오 마진 + GO/CAUTION/NO-GO 배지
  └ 실적 (Phase2)
/lots, /lots/new
/lot-groups/[id]       공통비 배분 (기준 변경시 결과 비교)
/compare               SKU 비교 랭킹
/cashflow              캐시플로우 타임라인
/settings/fees         🔴 수수료 테이블 CRUD
/settings/fees/import  CSV/XLSX 업로드
/settings/assumptions  가정값 관리
/settings/promotions   프로모션 (my_start_date 입력)
/settings/fx           환율 이력
/settlements           정산 업로드 (Phase2)
/settlements/variance  추정 vs 실측 (Phase2)
```

### 5-1. 수수료 테이블 CRUD (필수 스펙)
- 카테고리 요율: 인라인 편집
- 물류비: 사이즈 × 가격구간 매트릭스 뷰 (엑셀처럼)
- 신규 버전 생성시 `effective_from` 지정 → 기존행 `effective_to` 자동 마감
- **업로드: CSV/XLSX 드롭 → 컬럼 매핑 UI → 🔴 diff 프리뷰 → 확정**
  - diff 예: "판매수수료 10.5% → 11.2%, 영향 SKU 3개, 마진 -0.7%p"
- 템플릿 다운로드 제공
- **`is_verified=false`인 행은 UI에서 노란 배지 + "윙에서 확인 필요" 표시**

### 5-2. 대시보드 알림
- 🔴 프로모션 D-day (`my_start_date` + 90일) → "D-12, 종료 후 마진 19.5%→2.1%"
- 🔴 누적매출 2억 캡 도달률
- 무료보관 만료 임박 로트 (입고 + 30/45/60일)
- 월 반품 무료쿼터 20건 소진율
- 월매출 100만원 임박 → 55,000원 발생 경고
- 비관 시나리오 마이너스 SKU
- 재고 소진 예상일

### 5-3. 가격 시뮬레이터
슬라이더 당기면 사이즈구간·수수료·마진 실시간 반영. **19,800원 무료배송 경계선 시각 표시.**

### 5-4. SKU 비교 랭킹
정렬 기준: 마진율 / 개당이익 / **ROI(투입현금 대비)** / **현금회전일수** / BEP수량
🔴 **ROI × 회전율 = 연환산 자본수익률 → 이게 진짜 순위.** 기본 정렬로.

---

## 6. 1688 수집 (북마클릿 방식 — 확정)

**왜 이 방식인가:** 서버 fetch(Vercel IP)는 1688이 차단함. 크롬 확장은 오버킬. 북마클릿은 사용자 로그인 세션으로 DOM을 긁으므로 차단 없고 설치 5초.

**구현:**
1. `/api/ingest` (POST) — `?token=INGEST_TOKEN` 검증, CORS `https://*.1688.com` 허용
2. `/settings/bookmarklet` — 북마클릿 코드 생성 + 복사 버튼 + 설치 안내
3. 북마클릿 JS: 1688 상품페이지 DOM에서 상품명/가격/이미지/공급사/옵션 추출 → `/api/ingest`로 POST → `product.source_snapshot`에 원문 저장
4. **폴백 2종 필수:**
   - URL만 붙여넣기 → `source_offer_id` 정규식 파싱 (`/offer/(\d+)\.html`) + 나머지 수동입력
   - 페이지 HTML 붙여넣기 → 서버에서 파싱

🔴 1688 DOM 구조는 언제든 바뀜. 파서 실패시 조용히 죽지 말고 **폴백으로 안내**할 것.

---

## 7. 시딩 데이터

`/seed/` 에 CSV 5종 + 양말 프로파일 제공됨. `drizzle-kit seed` 또는 스크립트로 주입.

| 파일 | 내용 | 검증상태 |
|---|---|---|
| `fee_category.csv` | 125행, 15대분류, 4.0~10.9% | 🔴 출처 페이지가 **2019-11-25 기준**. `effective_from=2019-11-25`, `is_verified=FALSE`로 넣을 것 |
| `fee_logistics.csv` | 6단계 하한값만 | 🔴 `is_verified=FALSE`. 실제는 카테고리×사이즈×판매가 3중 매트릭스 → 사용자가 윙에서 확인 후 업로드 |
| `fee_misc.csv` | 무료쿼터/월이용료 | 쿼터·55,000원·3.3%는 확정. **단가는 대부분 미확인** |
| `promotion.csv` | 4종 | 신규90일/세이버/신규상품45일/광고지원금 |
| `assumption_default.csv` | 13카테고리 × 3시나리오 | 🔴 **전부 `is_estimate=TRUE`** |
| `socks_profile.ts` | 양말 프로파일 + 함정 6종 + 사이즈 테스트케이스 | 관세율 13%는 **미검증 가정** |

🔴 `fee_size_rule`은 시딩 데이터 없음 (공식 확인 불가). **빈 테이블 + 온보딩에서 "윙에서 확인 후 입력" 안내.** 미입력시 사이즈 판정기는 에러가 아니라 "규칙 미설정" 상태를 반환할 것.

---

## 8. 구현 순서

**Phase 1-A 기반**
Next.js + Drizzle + Neon 연결 / 스키마 마이그레이션 / 시딩 스크립트 / Basic Auth 미들웨어 / 수수료 CRUD + 업로드(diff 프리뷰)

**Phase 1-B 계산 엔진 (UI보다 먼저)**
`/lib/calc/` 전 함수 + Vitest. 양말 테스트케이스 통과 확인.

**Phase 1-C SKU/로트**
등록폼 / URL 파싱 / 북마클릿 + `/api/ingest` / 사이즈 판정기 / 착지원가 / 공통비 배분

**Phase 1-D 판정**
3시나리오 + GO/CAUTION/NO-GO / 가격 시뮬레이터 / 세트 최적화기 / 프로모션 전후 비교 / BEP / 캐시플로우

**Phase 1-E 비교/대시보드**
비교 랭킹(ROI×회전율) / 알림

**Phase 2**
정산 XLSX 파서 / 실적 입력 / variance 분석 / 🔴 **가정값 자동 교정** (실측 쌓이면 `is_estimate` → FALSE)

---

## 9. 최종 체크리스트

- [ ] 수수료/요율 하드코딩 0건
- [ ] 모든 계산 함수가 `asOfDate` 수용
- [ ] 3시나리오 항상 병렬 표시, 단일 숫자 노출 없음
- [ ] `is_verified=false` / `is_estimate=true` UI 배지
- [ ] 프로모션 중/후 마진 병렬 표시
- [ ] 19,800원 무료배송 경계 시각화
- [ ] 사이즈 경계 경고 동작
- [ ] `return_resalable=false`시 원가 전손 계산
- [ ] 수입VAT 공제 토글 (기본 ON)
- [ ] 공통비 배분 기본 = CBM
- [ ] 캐시플로우 maxCashLocked 표시
- [ ] `/api/ingest`만 Basic Auth 제외 + 토큰 검증
- [ ] 북마클릿 폴백 2종
- [ ] `fee_size_rule` 미설정시 graceful 처리
- [ ] 계산 엔진 Vitest 커버리지
