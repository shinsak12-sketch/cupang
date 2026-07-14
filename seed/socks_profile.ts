// 양말 프로파일 — 첫 상품 기준 세팅
// ⚠️ 모든 수치는 "가정"이며 윙 로그인 후 실제값으로 교체 필요

export const SOCKS_PROFILE = {
  category: {
    major: '패션',
    middle: '패션잡화',
    minor: null,
    commissionRate: 10.5,        // 공식 Fee-Table 기준
    serviceFeeThreshold: 1000000, // 월매출 100만원 초과시 55,000원
    rgEligible: true,
    isVerified: false,            // ← 윙에서 본인계정 요율 확인 후 TRUE로
    note: '스포츠양말로 등록해도 스포츠의류 10.5%로 동일. 카테고리 선택 절감여지 없음',
  },

  // 보관비 특례 — 이게 양말의 최대 강점
  storage: {
    freeDays: 45,                 // 의류/신발/악세서리는 45일 무료 (일반 30일 대비 +15일)
    freeDaysWithSaver: 60,        // 세이버 가입시 60일
    appliesTo: 'fashion',
    note: '양말=악세서리/의류군 → 45일 무료 적용 대상',
  },

  // 사이즈 — 양말은 거의 확실히 XS
  size: {
    expected: 'XS',
    typicalPackage: {
      // 양말 1켤레 폴리백 포장 기준 (가정)
      widthMm: 120,
      depthMm: 30,
      heightMm: 180,
      weightG: 60,
    },
    dimSumCm: 33,                 // 12+3+18
    note: 'XS 확정 가능성 높음. 3족/5족 세트로 묶으면 S로 넘어갈 수 있으니 판정기 필수',
  },

  // 반품률 — 양말은 패션 중에서도 낮은 편
  assumptions: {
    optimistic:  { returnRate: 5.0,  defectRate: 2.0, sellThrough: 95, roas: 400, storageDays: 25 },
    base:        { returnRate: 8.0,  defectRate: 3.0, sellThrough: 80, roas: 300, storageDays: 45 },
    pessimistic: { returnRate: 15.0, defectRate: 6.0, sellThrough: 60, roas: 150, storageDays: 75 },
    isEstimate: true,
    rationale: [
      '패션 일반 반품률 15~20%보다 낮게 잡음 — 양말은 사이즈 편차가 작고 저단가라 반품 유인이 적음',
      '단, 위생용품 성격상 반품시 재판매 불가 가능성 높음 → 반품=원가 전손으로 계산해야 함',
      '이 점이 의류 대비 불리. 반품률은 낮지만 반품 1건당 손실은 100%',
      '소진율 비관 60%는 사이즈/색상 미스매치 재고 반영',
    ],
  },

  // 관세 — 양말 HS코드
  customs: {
    hsCode: '6115.xx',
    hsDescription: '팬티스타킹·타이츠·스타킹·양말류 (편물제)',
    tariffRate: 13.0,             // ⚠️ 가정치. 관세청 품목분류로 반드시 확인
    isVerified: false,
    ftaApplicable: true,
    ftaNote: '한중FTA 원산지증명서(C/O) 있으면 세율 인하 가능. 1688 공급사에 C/O 발급 가능한지 확인 필수 — 이거 하나로 마진 수%p 갈림',
    certRequired: [],
    certNote: '성인용 일반 양말은 KC 대상 아님. 단 유아용(36개월 이하)은 어린이제품 안전확인 대상 → 유아 양말 하려면 인증비 발생',
  },

  // 양말 특유의 함정
  pitfalls: [
    {
      key: 'free_shipping_threshold',
      title: '19,800원 무료배송 경계',
      detail: '양말 단품은 절대 못 넘김. 로켓그로스는 결제 19,800원 이상이어야 무료배송. 즉 양말은 반드시 세트(3족/5족/10족) 구성으로 가야 함. 단품 판매는 성립 자체가 안 됨',
      severity: 'critical',
    },
    {
      key: 'set_size_jump',
      title: '세트 구성시 사이즈 등급 상승',
      detail: '단품 XS(600/1350) → 10족 세트면 S 또는 M으로 넘어갈 수 있음. M이면 배송비 2,100원. 세트 수량별로 사이즈 판정 다시 돌려야 함',
      severity: 'high',
    },
    {
      key: 'return_total_loss',
      title: '반품 = 원가 전손',
      detail: '양말은 위생상 반품 재판매 불가 처리가 일반적. 반품률 8%면 매출의 8%가 아니라 원가의 8%가 통째로 증발 + 회수비 + 폐기비',
      severity: 'high',
    },
    {
      key: 'low_unit_price',
      title: '저단가 구조 = 물류비 비중 폭증',
      detail: '판매가 10,000원 기준 배송비 1,350원이면 13.5%. 수수료 10.5% 합치면 벌써 24%. 저단가일수록 고정 물류비가 마진을 잡아먹음 → 객단가 올리는 세트 구성이 유일한 해법',
      severity: 'critical',
    },
    {
      key: 'promo_cliff',
      title: '90일 프로모션 절벽',
      detail: '지금 신규 90일간 입출고비+배송비 0원. 양말은 이 금액이 개당 1,950원(600+1350) → 프로모션 끝나면 판매가 10,000원 상품의 마진이 19.5%p 증발. 프로모션 마진으로 가격 짜면 91일차에 즉사',
      severity: 'critical',
    },
    {
      key: 'competition',
      title: '쿠팡 PB(코멧) 정면충돌 구역',
      detail: '양말은 코멧이 초저가로 깔아둔 대표 품목. 가격경쟁 불가. 디자인/기능/세트구성 차별화 없으면 진입 무의미',
      severity: 'high',
    },
  ],

  // 사이즈 판정 테스트 케이스
  testCases: [
    { name: '양말 1족 폴리백',    w:120, d:30,  h:180, g:60,   expect:'XS' },
    { name: '양말 3족 세트',      w:150, d:60,  h:200, g:180,  expect:'XS' },
    { name: '양말 5족 세트',      w:180, d:90,  h:220, g:300,  expect:'S'  },
    { name: '양말 10족 박스',     w:250, d:150, h:280, g:600,  expect:'S'  },
    { name: '경계 테스트(임의)',  w:300, d:200, h:300, g:1000, expect:'M'  },
  ],
};

// ⚠️ 위 사이즈 판정 임계값(dimSum/weight 구간)은 공식 문서에서 확인 불가.
// 윙 > 로켓그로스 > 사이즈 가이드 페이지에서 확인 후 fee_size_rule 테이블에 입력할 것.
// 판정기는 규칙을 DB에서 읽어오게 구현하고, 하드코딩하지 말 것.
