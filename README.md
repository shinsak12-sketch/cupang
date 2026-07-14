# 🚀 cupang — 로켓그로스 수익계산기

1688에서 사입해 **쿠팡 로켓그로스**로 판매하는 개인 셀러용 수익 계산·관리 웹앱.
핵심 목적은 *"이 상품 팔면 최종 얼마 남는가"* 를 판정하고 **팔면 안 되는 상품을 걸러내는 것**.

> 상세 스펙은 루트의 [`CLAUDE_CODE_PROMPT.md`](./CLAUDE_CODE_PROMPT.md) 참고.

## 절대 원칙
1. 단일 마진 숫자 금지 — 항상 **낙관/기준/비관 3시나리오** 병렬 표시
2. 수수료·요율 **하드코딩 금지** — DB 테이블 + 유효기간(effective_from/to) 버전 관리
3. 모든 수치에 `is_verified` / `is_estimate` 플래그, UI 배지로 구분
4. 계산 엔진은 순수 함수(`/lib/calc/`)로 UI와 완전 분리 + Vitest
5. 모든 계산 함수는 `asOfDate` 를 받아 해당 시점 유효 요율로 계산

## 기술 스택
Next.js 15 (App Router, TS) · Neon(Postgres) · Drizzle ORM · Tailwind + shadcn/ui ·
TanStack Query · react-hook-form + zod · Recharts · SheetJS · Vitest · Vercel

## 시작하기

```bash
npm install
cp .env.example .env    # 값 채우기 (아래 참고)

npm run db:push         # 스키마를 Neon 에 반영 (또는 db:generate + db:migrate)
npm run db:seed         # /seed 의 CSV 5종 + 양말 프로파일 주입

npm run dev             # http://localhost:3000
```

### 환경변수 (`.env`)
| 키 | 설명 |
|---|---|
| `DATABASE_URL` | Neon Postgres 연결 문자열 (serverless) |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` | 전 경로 Basic Auth |
| `INGEST_TOKEN` | 1688 수집 북마클릿 전용 시크릿 (`/api/ingest` 검증) |

인증: `middleware.ts` 가 전 경로에 Basic Auth 적용. **단 `/api/ingest` 는 제외**
(북마클릿이 호출 → `?token=INGEST_TOKEN` 자체 검증 + `https://*.1688.com` CORS 허용).

## 시딩 데이터 (`/seed`)
| 파일 | 내용 | 검증상태 |
|---|---|---|
| `fee_category.csv` | 15대분류 카테고리 요율 | `is_verified=FALSE` (2019-11-25 기준) |
| `fee_logistics.csv` | 사이즈 6단계 입출고비/배송비 | `is_verified=FALSE` (하한값 플레이스홀더) |
| `fee_misc.csv` | 무료쿼터/월이용료/반품비 등 | 쿼터·55,000·3.3%만 확정 |
| `promotion.csv` | 신규90일/세이버/신규상품45일/광고지원금 | — |
| `assumption_default.csv` | 13카테고리 × 3시나리오 | **전부 `is_estimate=TRUE`** |
| `socks_profile.ts` | 양말 프로파일 + 함정 6종 + 사이즈 테스트케이스 | 관세율 13% 미검증 |

> `fee_size_rule` 은 **의도적으로 비어 있음** (공식 확인 불가). 윙에서 사이즈 임계값 확인 후 입력.

## 구현 현황 (Phase)
- ✅ **Phase 1-A** — Next.js + Drizzle + Neon / 스키마 / 시딩 / Basic Auth / 수수료 CRUD + 업로드(diff 프리뷰)
- ✅ **Phase 1-B** — 계산 엔진 `/lib/calc/` + Vitest 26 tests (양말 테스트케이스 XS/XS/S/S/M 통과)
- ✅ **Phase 1-C** — SKU 등록 · URL offer_id 파싱 · 북마클릿 + `/api/ingest` · 사이즈 판정기
- ✅ **Phase 1-D** — 3시나리오 GO/CAUTION/NO-GO · 가격 시뮬레이터 · 세트 최적화 · 프로모션 전후 · 캐시플로우
- ✅ **Phase 1-E** — 비교 랭킹(ROI×회전율 연환산) · 대시보드 프로모션 D-day 알림
- ⬜ Phase 2 — 정산 XLSX 파서 · 실적 입력 · variance 분석 · 가정값 자동 교정
  (스키마 `settlement_upload/raw`, `sales_actual`, `variance` 는 미리 생성됨)

### 아직 실측 필요 (모두 미검증 플래그로 표시됨)
- `fee_size_rule` 은 빈 테이블 — 윙에서 사이즈 임계값 확인 후 입력해야 사이즈 판정기가 동작
- `fee_logistics` 는 하한값 플레이스홀더 — 실제는 카테고리×사이즈×판매가 3중 매트릭스
- `fee_category` 요율(2019-11-25 기준), 양말 관세율 13% 등은 `is_verified=false`
- 착지원가는 로트(lot) 입력 또는 시뮬레이터 override 로 들어감 — 로트 CRUD UI는 후속

## 스크립트
| 명령 | 설명 |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run db:push` | 스키마를 DB에 직접 반영 |
| `npm run db:generate` / `db:migrate` | 마이그레이션 생성/적용 |
| `npm run db:seed` | 시딩 |
| `npm run test` | Vitest |
| `npm run typecheck` | tsc --noEmit |
