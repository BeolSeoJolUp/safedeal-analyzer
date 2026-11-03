/* ==========================================================================
   SafeDeal URL Analyzer — data.js
   내장 데이터: ① 인기 검색어 칩 ② 2026년 11월 기준 스마트폰·IT 기기 현실화 시세 DB
   ③ 상태 등급 규칙 ④ 위험/금지 키워드 사전 ⑤ 시연용 프리셋
   ========================================================================== */
window.SD = window.SD || {};

(function (SD) {
  'use strict';

  /* 빠른 테스트용 인기 검색어 칩 5개 */
  SD.POPULAR_QUERIES = [
    '아이폰 18 Pro',
    '아이폰 듀오',
    '아이폰 17 Pro',
    '갤럭시 S25 울트라',
    '에어팟 프로 2세대'
  ];

  /* ---------- 상태 등급 (기본 비교 기준: 일반 중고 A급 / 인식된 상태 등급에 맞춤) ---------- */
  SD.CONDITIONS = {
    '미개봉': { mult: 1.25, label: '미개봉 시세', desc: '미개봉 · 새상품 · 미개통' },
    'S급':   { mult: 1.10, label: 'S급 적정가', desc: '사용감 거의 없음 · 풀박스' },
    'A급':   { mult: 1.00, label: '중고 평균 (A급)', desc: '일반 중고 평균 시세 (기본 비교 기준)' },
    'B급':   { mult: 0.80, label: 'B급/사용감', desc: '생활기스 · 사용감 있음' }
  };

  /* 주의: 본문에 '미개봉', '새상품', '미개통'이 명확히 표기된 경우에만 미개봉으로 판정 */
  SD.CONDITION_RULES = [
    ['미개봉', /(?:^|[^가-힣a-z])(미개봉|새\s*상품|미개통|밀봉\s*새\s*제품|실링\s*미개봉)(?![\s]*(?:아님|아니|제외|구매\s*후|사서|출고가|정가))/i],
    ['S급', /((?:^|[^a-z])s\s*\+?\s*급|ss\s*급|특\s*a\s*급|민트\s*급|신품\s*급)/i],
    ['B급', /((?:^|[^a-z])[bc]\s*\+?\s*급|생활\s*기스\s*많|사용감\s*많|액정\s*(?:깨|파손)|하자\s*있|부품용)/i],
    ['A급', /((?:^|[^a-z])a\s*\+?\s*급|상태\s*(?:좋|양호|깨끗))/i]
  ];

  /* ---------- 2026년 11월 기준 실제 중고 시세 DB (상단 URL 분석기 & 하단 실시간 시세 조회기 100% 동일 참조) ----------
   * basePrice = A급 기준가 | bGrade = B급 (A급의 약 80%) | sGrade = S급 (A급의 약 110%) | unopened = 미개봉 (A급의 약 125%)
   * 시리즈 번호(20, 21, 22, 23, 24, 25, 26 / 8, 11, 12, 13, 14, 15, 16, 17, 18) 및 파생형(Pro Max, Ultra, Plus, Air, Fold, Flip, Duo) 100% 정확 구분
   */
  SD.MARKET_DB_2026 = [
    /* === 아이폰 듀오(Duo) / 아이폰 폴드(Fold) === */
    {
      name: '아이폰 듀오 (iPhone Duo)',
      keys: ['iphoneduo', 'iphone18duo', '아이폰듀오'],
      retailPrice: 3300000,
      unopened: 3150000,
      sGrade: 2900000,
      basePrice: 2700000,
      bGrade: 2400000,
      baseGB: 256,
      stepDelta: 200000,
      samples: 27,
      family: 'iphone'
    },
    {
      name: '아이폰 폴드 (iPhone Fold)',
      keys: ['iphonefold', 'iphone18fold', '아이폰폴드', '아이폰폴더블'],
      retailPrice: 3300000,
      unopened: 3150000,
      sGrade: 2900000,
      basePrice: 2700000,
      bGrade: 2400000,
      baseGB: 256,
      stepDelta: 200000,
      samples: 24,
      family: 'iphone'
    },

    /* === 아이폰 18 시리즈 (2026년 11월 현실 시세) === */
    {
      name: '아이폰 18 Pro Max',
      keys: ['iphone18promax', 'iphone18pm', '18promax'],
      unopened: 2190000,
      sGrade: 1930000,
      basePrice: 1750000,
      bGrade: 1520000,
      baseGB: 256,
      stepDelta: 180000,
      samples: 34,
      family: 'iphone'
    },
    {
      name: '아이폰 18 Pro',
      keys: ['iphone18pro', '18pro'],
      unopened: 1900000,
      sGrade: 1670000,
      basePrice: 1520000,
      bGrade: 1320000,
      baseGB: 256,
      stepDelta: 160000,
      samples: 38,
      family: 'iphone'
    },
    {
      name: '아이폰 18 Air',
      keys: ['iphone18air', 'iphone18aero', 'iphone18slim', 'iphone18plus', '18air', '18aero'],
      unopened: 1600000,
      sGrade: 1410000,
      basePrice: 1280000,
      bGrade: 1100000,
      baseGB: 256,
      stepDelta: 140000,
      samples: 29,
      family: 'iphone'
    },
    {
      name: '아이폰 18',
      keys: ['iphone18'],
      unopened: 1440000,
      sGrade: 1270000,
      basePrice: 1150000,
      bGrade: 980000,
      baseGB: 128,
      stepDelta: 120000,
      samples: 35,
      family: 'iphone'
    },

    /* === 아이폰 17 시리즈 (2026년 11월 현실 시세) === */
    {
      name: '아이폰 17 Pro Max',
      keys: ['iphone17promax', 'iphone17pm', '17promax'],
      unopened: 1650000,
      sGrade: 1450000,
      basePrice: 1320000,
      bGrade: 1120000,
      baseGB: 256,
      stepDelta: 140000,
      samples: 36,
      family: 'iphone'
    },
    {
      name: '아이폰 17 Pro',
      keys: ['iphone17pro', '17pro'],
      unopened: 1440000,
      sGrade: 1270000,
      basePrice: 1150000,
      bGrade: 980000,
      baseGB: 256,
      stepDelta: 130000,
      samples: 39,
      family: 'iphone'
    },
    {
      name: '아이폰 17 Plus',
      keys: ['iphone17plus', 'iphone17air', 'iphone17aero', '17plus', '17air'],
      unopened: 1190000,
      sGrade: 1050000,
      basePrice: 950000,
      bGrade: 810000,
      baseGB: 128,
      stepDelta: 100000,
      samples: 31,
      family: 'iphone'
    },
    {
      name: '아이폰 17',
      keys: ['iphone17'],
      unopened: 1080000,
      sGrade: 950000,
      basePrice: 860000,
      bGrade: 730000,
      baseGB: 128,
      stepDelta: 90000,
      samples: 37,
      family: 'iphone'
    },

    /* === 아이폰 16 시리즈 (2026년 11월 현실 시세) === */
    { name: '아이폰 16 Pro Max', keys: ['iphone16promax', 'iphone16pm', '16promax'], unopened: 1400000, sGrade: 1230000, basePrice: 1120000, bGrade: 950000, baseGB: 256, stepDelta: 110000, samples: 38, family: 'iphone' },
    { name: '아이폰 16 Pro', keys: ['iphone16pro', '16pro'], unopened: 1200000, sGrade: 1060000, basePrice: 960000, bGrade: 820000, baseGB: 128, stepDelta: 90000, samples: 40, family: 'iphone' },
    { name: '아이폰 16 Plus', keys: ['iphone16plus', '16plus'], unopened: 1000000, sGrade: 880000, basePrice: 800000, bGrade: 680000, baseGB: 128, stepDelta: 80000, samples: 30, family: 'iphone' },
    { name: '아이폰 16e', keys: ['iphone16e', '16e'], unopened: 700000, sGrade: 620000, basePrice: 560000, bGrade: 450000, baseGB: 128, stepDelta: 60000, samples: 28, family: 'iphone' },
    { name: '아이폰 16', keys: ['iphone16'], unopened: 900000, sGrade: 790000, basePrice: 720000, bGrade: 600000, baseGB: 128, stepDelta: 70000, samples: 39, family: 'iphone' },

    /* === 아이폰 15 시리즈 (2026년 11월 현실 시세) === */
    { name: '아이폰 15 Pro Max', keys: ['iphone15promax', 'iphone15pm', '15promax'], unopened: 1190000, sGrade: 1050000, basePrice: 950000, bGrade: 800000, baseGB: 256, stepDelta: 90000, samples: 36, family: 'iphone' },
    { name: '아이폰 15 Pro', keys: ['iphone15pro', '15pro'], unopened: 1030000, sGrade: 900000, basePrice: 820000, bGrade: 690000, baseGB: 128, stepDelta: 80000, samples: 38, family: 'iphone' },
    { name: '아이폰 15 Plus', keys: ['iphone15plus', '15plus'], unopened: 850000, sGrade: 750000, basePrice: 680000, bGrade: 560000, baseGB: 128, stepDelta: 70000, samples: 29, family: 'iphone' },
    { name: '아이폰 15', keys: ['iphone15'], unopened: 750000, sGrade: 660000, basePrice: 600000, bGrade: 500000, baseGB: 128, stepDelta: 60000, samples: 37, family: 'iphone' },

    /* === 아이폰 14 시리즈 (2026년 11월 현실 시세) === */
    { name: '아이폰 14 Pro Max', keys: ['iphone14promax', 'iphone14pm', '14promax'], unopened: 950000, sGrade: 840000, basePrice: 760000, bGrade: 630000, baseGB: 128, stepDelta: 70000, samples: 34, family: 'iphone' },
    { name: '아이폰 14 Pro', keys: ['iphone14pro', '14pro'], unopened: 830000, sGrade: 730000, basePrice: 660000, bGrade: 550000, baseGB: 128, stepDelta: 60000, samples: 36, family: 'iphone' },
    { name: '아이폰 14 Plus', keys: ['iphone14plus', '14plus'], unopened: 680000, sGrade: 590000, basePrice: 540000, bGrade: 440000, baseGB: 128, stepDelta: 50000, samples: 26, family: 'iphone' },
    { name: '아이폰 14', keys: ['iphone14'], unopened: 600000, sGrade: 530000, basePrice: 480000, bGrade: 390000, baseGB: 128, stepDelta: 50000, samples: 35, family: 'iphone' },

    /* === 아이폰 13 시리즈 (2026년 11월 현실 시세) === */
    { name: '아이폰 13 Pro Max', keys: ['iphone13promax', 'iphone13pm', '13promax'], unopened: 730000, sGrade: 640000, basePrice: 580000, bGrade: 480000, baseGB: 128, stepDelta: 50000, samples: 32, family: 'iphone' },
    { name: '아이폰 13 Pro', keys: ['iphone13pro', '13pro'], unopened: 630000, sGrade: 550000, basePrice: 500000, bGrade: 410000, baseGB: 128, stepDelta: 50000, samples: 34, family: 'iphone' },
    { name: '아이폰 13 mini', keys: ['iphone13mini', '13mini'], unopened: 390000, sGrade: 340000, basePrice: 310000, bGrade: 250000, baseGB: 128, stepDelta: 40000, samples: 31, family: 'iphone' },
    { name: '아이폰 13', keys: ['iphone13'], unopened: 480000, sGrade: 420000, basePrice: 380000, bGrade: 310000, baseGB: 128, stepDelta: 40000, samples: 36, family: 'iphone' },

    /* === 아이폰 12 시리즈 (2026년 11월 현실 시세) === */
    { name: '아이폰 12 Pro Max', keys: ['iphone12promax', 'iphone12pm', '12promax'], unopened: 530000, sGrade: 460000, basePrice: 420000, bGrade: 340000, baseGB: 128, stepDelta: 40000, samples: 28, family: 'iphone' },
    { name: '아이폰 12 Pro', keys: ['iphone12pro', '12pro'], unopened: 440000, sGrade: 390000, basePrice: 350000, bGrade: 280000, baseGB: 128, stepDelta: 40000, samples: 30, family: 'iphone' },
    { name: '아이폰 12 mini', keys: ['iphone12mini', '12mini'], unopened: 250000, sGrade: 220000, basePrice: 200000, bGrade: 160000, baseGB: 64, stepDelta: 30000, samples: 27, family: 'iphone' },
    { name: '아이폰 12', keys: ['iphone12'], unopened: 330000, sGrade: 290000, basePrice: 260000, bGrade: 210000, baseGB: 64, stepDelta: 30000, samples: 32, family: 'iphone' },

    /* === 아이폰 11 / SE / XS / XR / X / 8 시리즈 (2026년 11월 현실 시세) === */
    { name: '아이폰 11 Pro Max', keys: ['iphone11promax', 'iphone11pm', '11promax'], unopened: 360000, sGrade: 320000, basePrice: 290000, bGrade: 230000, baseGB: 64, stepDelta: 30000, samples: 24, family: 'iphone' },
    { name: '아이폰 11 Pro', keys: ['iphone11pro', '11pro'], unopened: 310000, sGrade: 280000, basePrice: 250000, bGrade: 200000, baseGB: 64, stepDelta: 30000, samples: 26, family: 'iphone' },
    { name: '아이폰 11', keys: ['iphone11'], unopened: 240000, sGrade: 210000, basePrice: 190000, bGrade: 150000, baseGB: 64, stepDelta: 20000, samples: 29, family: 'iphone' },
    { name: '아이폰 SE 4세대', keys: ['iphonese4', 'iphonese4gen', 'se4'], unopened: 560000, sGrade: 500000, basePrice: 450000, bGrade: 360000, baseGB: 128, stepDelta: 40000, samples: 28, family: 'iphone' },
    { name: '아이폰 SE 3세대', keys: ['iphonese3', 'iphonese3gen', 'iphonese2022', 'se3'], unopened: 230000, sGrade: 200000, basePrice: 180000, bGrade: 140000, baseGB: 64, stepDelta: 20000, samples: 30, family: 'iphone', bio: 'touch' },
    { name: '아이폰 SE 2세대', keys: ['iphonese2', 'iphonese2gen', 'iphonese2020', 'iphonese', 'se2'], unopened: 100000, sGrade: 90000, basePrice: 80000, bGrade: 50000, baseGB: 64, stepDelta: 10000, samples: 27, family: 'iphone', bio: 'touch' },
    { name: '아이폰 XS Max', keys: ['iphonexsmax', 'xsmax'], unopened: 210000, sGrade: 190000, basePrice: 170000, bGrade: 130000, baseGB: 64, stepDelta: 20000, samples: 22, family: 'iphone' },
    { name: '아이폰 XS', keys: ['iphonexs'], unopened: 160000, sGrade: 140000, basePrice: 130000, bGrade: 100000, baseGB: 64, stepDelta: 20000, samples: 24, family: 'iphone' },
    { name: '아이폰 XR', keys: ['iphonexr'], unopened: 160000, sGrade: 140000, basePrice: 130000, bGrade: 100000, baseGB: 64, stepDelta: 20000, samples: 25, family: 'iphone' },
    { name: '아이폰 X', keys: ['iphonex'], unopened: 160000, sGrade: 140000, basePrice: 130000, bGrade: 100000, baseGB: 64, stepDelta: 20000, samples: 21, family: 'iphone' },
    { name: '아이폰 8 Plus', keys: ['iphone8plus', '8plus'], unopened: 130000, sGrade: 110000, basePrice: 100000, bGrade: 70000, baseGB: 64, stepDelta: 10000, samples: 23, family: 'iphone', bio: 'touch' },
    { name: '아이폰 8', keys: ['iphone8'], unopened: 100000, sGrade: 90000, basePrice: 80000, bGrade: 50000, baseGB: 64, stepDelta: 10000, samples: 28, family: 'iphone', bio: 'touch' },

    /* === 갤럭시 S26 시리즈 (2026년 11월 현실 시세) === */
    { name: '갤럭시 S26 울트라', keys: ['galaxys26ultra', 'galaxy26ultra', 's26ultra'], unopened: 1690000, sGrade: 1490000, basePrice: 1350000, bGrade: 1150000, baseGB: 256, stepDelta: 140000, samples: 35, family: 'galaxy' },
    { name: '갤럭시 S26 플러스', keys: ['galaxys26plus', 'galaxy26plus', 's26plus'], unopened: 1280000, sGrade: 1120000, basePrice: 1020000, bGrade: 870000, baseGB: 256, stepDelta: 110000, samples: 29, family: 'galaxy' },
    { name: '갤럭시 S26', keys: ['galaxys26', 'galaxy26', 's26'], unopened: 1100000, sGrade: 970000, basePrice: 880000, bGrade: 750000, baseGB: 256, stepDelta: 90000, samples: 33, family: 'galaxy' },

    /* === 갤럭시 S25 시리즈 (2026년 11월 현실 시세) === */
    { name: '갤럭시 S25 울트라', keys: ['galaxys25ultra', 'galaxy25ultra', 's25ultra'], unopened: 1310000, sGrade: 1160000, basePrice: 1050000, bGrade: 880000, baseGB: 256, stepDelta: 110000, samples: 39, family: 'galaxy' },
    { name: '갤럭시 S25 엣지', keys: ['galaxys25edge', 'galaxy25edge', 's25edge'], unopened: 1100000, sGrade: 970000, basePrice: 880000, bGrade: 730000, baseGB: 256, stepDelta: 90000, samples: 26, family: 'galaxy' },
    { name: '갤럭시 S25 플러스', keys: ['galaxys25plus', 'galaxy25plus', 's25plus'], unopened: 1000000, sGrade: 880000, basePrice: 800000, bGrade: 670000, baseGB: 256, stepDelta: 80000, samples: 32, family: 'galaxy' },
    { name: '갤럭시 S25', keys: ['galaxys25', 'galaxy25', 's25'], unopened: 850000, sGrade: 750000, basePrice: 680000, bGrade: 570000, baseGB: 256, stepDelta: 70000, samples: 37, family: 'galaxy' },

    /* === 갤럭시 S24 시리즈 (2026년 11월 현실 시세) === */
    { name: '갤럭시 S24 울트라', keys: ['galaxys24ultra', 'galaxy24ultra', 's24ultra'], unopened: 1030000, sGrade: 900000, basePrice: 820000, bGrade: 680000, baseGB: 256, stepDelta: 80000, samples: 38, family: 'galaxy' },
    { name: '갤럭시 S24 플러스', keys: ['galaxys24plus', 'galaxy24plus', 's24plus'], unopened: 800000, sGrade: 700000, basePrice: 640000, bGrade: 530000, baseGB: 256, stepDelta: 60000, samples: 31, family: 'galaxy' },
    { name: '갤럭시 S24 FE', keys: ['galaxys24fe', 'galaxy24fe', 's24fe'], unopened: 530000, sGrade: 460000, basePrice: 420000, bGrade: 340000, baseGB: 256, stepDelta: 40000, samples: 27, family: 'galaxy' },
    { name: '갤럭시 S24', keys: ['galaxys24', 'galaxy24', 's24'], unopened: 650000, sGrade: 570000, basePrice: 520000, bGrade: 430000, baseGB: 256, stepDelta: 50000, samples: 36, family: 'galaxy' },

    /* === 갤럭시 S23 시리즈 (2026년 11월 현실 시세) === */
    { name: '갤럭시 S23 울트라', keys: ['galaxys23ultra', 'galaxy23ultra', 's23ultra'], unopened: 780000, sGrade: 680000, basePrice: 620000, bGrade: 500000, baseGB: 256, stepDelta: 60000, samples: 35, family: 'galaxy' },
    { name: '갤럭시 S23 플러스', keys: ['galaxys23plus', 'galaxy23plus', 's23plus'], unopened: 580000, sGrade: 510000, basePrice: 460000, bGrade: 380000, baseGB: 256, stepDelta: 50000, samples: 28, family: 'galaxy' },
    { name: '갤럭시 S23 FE', keys: ['galaxys23fe', 'galaxy23fe', 's23fe'], unopened: 350000, sGrade: 310000, basePrice: 280000, bGrade: 220000, baseGB: 256, stepDelta: 30000, samples: 25, family: 'galaxy' },
    { name: '갤럭시 S23', keys: ['galaxys23', 'galaxy23', 's23'], unopened: 480000, sGrade: 420000, basePrice: 380000, bGrade: 310000, baseGB: 256, stepDelta: 40000, samples: 34, family: 'galaxy' },

    /* === 갤럭시 S22 시리즈 (2026년 11월 현실 시세) === */
    { name: '갤럭시 S22 울트라', keys: ['galaxys22ultra', 'galaxy22ultra', 's22ultra'], unopened: 530000, sGrade: 460000, basePrice: 420000, bGrade: 340000, baseGB: 256, stepDelta: 40000, samples: 30, family: 'galaxy' },
    { name: '갤럭시 S22 플러스', keys: ['galaxys22plus', 'galaxy22plus', 's22plus'], unopened: 380000, sGrade: 330000, basePrice: 300000, bGrade: 240000, baseGB: 256, stepDelta: 30000, samples: 24, family: 'galaxy' },
    { name: '갤럭시 S22', keys: ['galaxys22', 'galaxy22', 's22'], unopened: 310000, sGrade: 280000, basePrice: 250000, bGrade: 200000, baseGB: 256, stepDelta: 30000, samples: 29, family: 'galaxy' },

    /* === 갤럭시 S21 시리즈 (2026년 11월 현실 시세 — 출시 5년 경과 구형 감가 완벽 반영) === */
    { name: '갤럭시 S21 울트라', keys: ['galaxys21ultra', 'galaxy21ultra', 's21ultra'], unopened: 360000, sGrade: 330000, basePrice: 290000, bGrade: 230000, baseGB: 256, stepDelta: 30000, samples: 33, family: 'galaxy' },
    { name: '갤럭시 S21 플러스', keys: ['galaxys21plus', 'galaxy21plus', 's21plus'], unopened: 280000, sGrade: 240000, basePrice: 220000, bGrade: 170000, baseGB: 256, stepDelta: 20000, samples: 26, family: 'galaxy' },
    { name: '갤럭시 S21', keys: ['galaxys21', 'galaxy21', 's21'], unopened: 230000, sGrade: 200000, basePrice: 180000, bGrade: 140000, baseGB: 256, stepDelta: 20000, samples: 31, family: 'galaxy' },

    /* === 갤럭시 S20 시리즈 (2026년 11월 현실 시세 — 구형 감가 완벽 반영) === */
    { name: '갤럭시 S20 울트라', keys: ['galaxys20ultra', 'galaxy20ultra', 's20ultra'], unopened: 250000, sGrade: 220000, basePrice: 200000, bGrade: 160000, baseGB: 256, stepDelta: 20000, samples: 25, family: 'galaxy' },
    { name: '갤럭시 S20 플러스', keys: ['galaxys20plus', 'galaxy20plus', 's20plus'], unopened: 200000, sGrade: 180000, basePrice: 160000, bGrade: 130000, baseGB: 256, stepDelta: 20000, samples: 24, family: 'galaxy' },
    { name: '갤럭시 S20 FE', keys: ['galaxys20fe', 'galaxy20fe', 's20fe'], unopened: 160000, sGrade: 140000, basePrice: 130000, bGrade: 100000, baseGB: 128, stepDelta: 15000, samples: 22, family: 'galaxy' },
    { name: '갤럭시 S20', keys: ['galaxys20', 'galaxy20', 's20'], unopened: 180000, sGrade: 150000, basePrice: 140000, bGrade: 110000, baseGB: 128, stepDelta: 15000, samples: 27, family: 'galaxy' },

    /* === 갤럭시 Z 폴드 / Z 플립 시리즈 (2026년 11월 현실 시세) === */
    { name: '갤럭시 Z폴드8 울트라', keys: ['galaxyzfold8ultra', 'galaxyfold8ultra', 'zfold8ultra', 'fold8ultra'], unopened: 2310000, sGrade: 2040000, basePrice: 1850000, bGrade: 1480000, baseGB: 512, stepDelta: 160000, samples: 22, family: 'galaxy' },
    { name: '갤럭시 Z폴드8', keys: ['galaxyzfold8', 'galaxyfold8', 'zfold8', 'fold8'], unopened: 2150000, sGrade: 1890000, basePrice: 1720000, bGrade: 1380000, baseGB: 256, stepDelta: 150000, samples: 26, family: 'galaxy' },
    { name: '갤럭시 Z폴드7', keys: ['galaxyzfold7', 'galaxyfold7', 'zfold7', 'fold7', 'galaxyzfold7ultra', 'fold7ultra'], unopened: 1810000, sGrade: 1600000, basePrice: 1450000, bGrade: 1160000, baseGB: 256, stepDelta: 140000, samples: 31, family: 'galaxy' },
    { name: '갤럭시 Z폴드6 울트라 / SE', keys: ['galaxyzfold6ultra', 'galaxyfold6ultra', 'zfold6ultra', 'fold6ultra', 'galaxyzfoldse', 'galaxyfoldse', 'zfoldse', 'foldse'], unopened: 1560000, sGrade: 1380000, basePrice: 1250000, bGrade: 1000000, baseGB: 512, stepDelta: 120000, samples: 25, family: 'galaxy' },
    { name: '갤럭시 Z폴드6', keys: ['galaxyzfold6', 'galaxyfold6', 'zfold6', 'fold6'], unopened: 1310000, sGrade: 1160000, basePrice: 1050000, bGrade: 880000, baseGB: 256, stepDelta: 100000, samples: 34, family: 'galaxy' },
    { name: '갤럭시 Z폴드5', keys: ['galaxyzfold5', 'galaxyfold5', 'zfold5', 'fold5'], unopened: 900000, sGrade: 790000, basePrice: 720000, bGrade: 580000, baseGB: 256, stepDelta: 70000, samples: 32, family: 'galaxy' },
    { name: '갤럭시 Z폴드4', keys: ['galaxyzfold4', 'galaxyfold4', 'zfold4', 'fold4'], unopened: 600000, sGrade: 530000, basePrice: 480000, bGrade: 380000, baseGB: 256, stepDelta: 50000, samples: 29, family: 'galaxy' },
    { name: '갤럭시 Z폴드3', keys: ['galaxyzfold3', 'galaxyfold3', 'zfold3', 'fold3'], unopened: 400000, sGrade: 350000, basePrice: 320000, bGrade: 250000, baseGB: 256, stepDelta: 30000, samples: 26, family: 'galaxy' },

    { name: '갤럭시 Z플립8', keys: ['galaxyzflip8', 'galaxyflip8', 'zflip8', 'flip8'], unopened: 1230000, sGrade: 1080000, basePrice: 980000, bGrade: 780000, baseGB: 256, stepDelta: 80000, samples: 27, family: 'galaxy' },
    { name: '갤럭시 Z플립7', keys: ['galaxyzflip7', 'galaxyflip7', 'zflip7', 'flip7'], unopened: 940000, sGrade: 830000, basePrice: 750000, bGrade: 600000, baseGB: 256, stepDelta: 70000, samples: 33, family: 'galaxy' },
    { name: '갤럭시 Z플립6', keys: ['galaxyzflip6', 'galaxyflip6', 'zflip6', 'flip6'], unopened: 690000, sGrade: 610000, basePrice: 550000, bGrade: 450000, baseGB: 256, stepDelta: 50000, samples: 36, family: 'galaxy' },
    { name: '갤럭시 Z플립5', keys: ['galaxyzflip5', 'galaxyflip5', 'zflip5', 'flip5'], unopened: 480000, sGrade: 420000, basePrice: 380000, bGrade: 300000, baseGB: 256, stepDelta: 40000, samples: 35, family: 'galaxy' },
    { name: '갤럭시 Z플립4', keys: ['galaxyzflip4', 'galaxyflip4', 'zflip4', 'flip4'], unopened: 290000, sGrade: 250000, basePrice: 230000, bGrade: 180000, baseGB: 256, stepDelta: 30000, samples: 31, family: 'galaxy' },
    { name: '갤럭시 Z플립3', keys: ['galaxyzflip3', 'galaxyflip3', 'zflip3', 'flip3'], unopened: 190000, sGrade: 170000, basePrice: 150000, bGrade: 110000, baseGB: 256, stepDelta: 20000, samples: 28, family: 'galaxy' },

    /* === 인기 IT 기기 (에어팟, 버즈, 아이패드, 맥북, 콘솔, 워치) === */
    { name: '에어팟 프로 3세대', keys: ['airpodspro3', 'airpodspro3gen'], basePrice: 280000, baseGB: null, samples: 32, family: 'iphone' },
    { name: '에어팟 프로 2세대', keys: ['airpodspro2', 'airpodspro2gen', 'airpodspro'], unopened: 240000, sGrade: 210000, basePrice: 190000, bGrade: 160000, baseGB: null, samples: 40, family: 'iphone' },
    { name: '에어팟 맥스', keys: ['airpodsmax'], unopened: 520000, sGrade: 460000, basePrice: 420000, bGrade: 360000, baseGB: null, samples: 29, family: 'iphone' },
    { name: '에어팟 4세대', keys: ['airpods4', 'airpods4gen'], basePrice: 160000, baseGB: null, samples: 34, family: 'iphone' },
    { name: '에어팟 3세대', keys: ['airpods3', 'airpods3gen'], basePrice: 120000, baseGB: null, samples: 31, family: 'iphone' },

    { name: '갤럭시 버즈3 프로', keys: ['galaxybuds3pro', 'buds3pro'], unopened: 210000, sGrade: 185000, basePrice: 165000, bGrade: 140000, baseGB: null, samples: 37, family: 'galaxy' },
    { name: '갤럭시 버즈3', keys: ['galaxybuds3', 'buds3'], basePrice: 105000, baseGB: null, samples: 33, family: 'galaxy' },
    { name: '갤럭시 버즈2 프로', keys: ['galaxybuds2pro', 'buds2pro'], basePrice: 85000, baseGB: null, samples: 35, family: 'galaxy' },

    { name: '아이패드 프로 M4', keys: ['ipadprom4', 'ipadpro7', 'ipadpro'], unopened: 1380000, sGrade: 1250000, basePrice: 1150000, bGrade: 980000, baseGB: 256, samples: 33, family: 'iphone' },
    { name: '아이패드 프로 M2', keys: ['ipadprom2', 'ipadpro6'], basePrice: 850000, baseGB: 128, samples: 29, family: 'iphone' },
    { name: '아이패드 에어 M2', keys: ['ipadairm2', 'ipadair6', 'ipadair'], basePrice: 700000, baseGB: 128, samples: 31, family: 'iphone' },
    { name: '아이패드 미니 7세대', keys: ['ipadmini7', 'ipadminia17'], basePrice: 600000, baseGB: 128, samples: 27, family: 'iphone' },
    { name: '아이패드 미니 6세대', keys: ['ipadmini6', 'ipadmini'], basePrice: 430000, baseGB: 64, samples: 30, family: 'iphone' },
    { name: '아이패드 10세대', keys: ['ipad10', 'ipad10gen'], basePrice: 370000, baseGB: 64, samples: 34, family: 'iphone' },

    { name: '맥북 프로 M4', keys: ['macbookprom4'], unopened: 2250000, sGrade: 2050000, basePrice: 1900000, bGrade: 1680000, baseGB: 512, samples: 25, family: 'iphone' },
    { name: '맥북 프로 M3', keys: ['macbookprom3', 'macbookpro'], basePrice: 1580000, baseGB: 512, samples: 28, family: 'iphone' },
    { name: '맥북 에어 M4', keys: ['macbookairm4'], basePrice: 1320000, baseGB: 256, samples: 27, family: 'iphone' },
    { name: '맥북 에어 M3', keys: ['macbookairm3', 'macbookair'], unopened: 1250000, sGrade: 1140000, basePrice: 1050000, bGrade: 910000, baseGB: 256, samples: 36, family: 'iphone' },
    { name: '맥북 에어 M2', keys: ['macbookairm2'], basePrice: 840000, baseGB: 256, samples: 34, family: 'iphone' },
    { name: '맥북 에어 M1', keys: ['macbookairm1'], basePrice: 560000, baseGB: 256, samples: 35, family: 'iphone' },

    { name: '애플워치 울트라 2', keys: ['applewatchultra2', 'applewatchultra', 'watchultra2'], basePrice: 720000, baseGB: null, samples: 28, family: 'iphone' },
    { name: '애플워치 10', keys: ['applewatch10', 'applewatchseries10', 'applewatch'], basePrice: 410000, baseGB: null, samples: 33, family: 'iphone' },
    { name: '애플워치 SE2', keys: ['applewatchse2', 'applewatchse'], basePrice: 190000, baseGB: null, samples: 31, family: 'iphone' },

    { name: '닌텐도 스위치 2', keys: ['nintendoswitch2', 'switch2'], basePrice: 480000, baseGB: null, samples: 34, family: 'other' },
    { name: '닌텐도 스위치 OLED', keys: ['nintendoswitcholed', 'switcholed', 'nintendoswitch'], unopened: 290000, sGrade: 260000, basePrice: 240000, bGrade: 200000, baseGB: null, samples: 38, family: 'other' },
    { name: 'PS5 프로', keys: ['ps5pro', 'playstation5pro'], unopened: 900000, sGrade: 820000, basePrice: 750000, bGrade: 650000, baseGB: null, samples: 31, family: 'other' },
    { name: 'PS5 슬림', keys: ['ps5slim', 'ps5', 'playstation5'], basePrice: 470000, baseGB: null, samples: 35, family: 'other' },
    { name: '갤럭시 탭 S10 울트라', keys: ['galaxytabs10ultra', 'tabs10ultra'], basePrice: 1180000, baseGB: 256, samples: 24, family: 'galaxy' },
    { name: '갤럭시 탭 S9', keys: ['galaxytabs9', 'tabs9'], basePrice: 640000, baseGB: 128, samples: 28, family: 'galaxy' }
  ];

  /* ---------- 위험 키워드 사전 ---------- */
  SD.RISK_CATEGORIES = [
    { id: 'price', label: '시세 괴리', max: 45, icon: '📉' },
    { id: 'phishing', label: '외부링크·피싱', max: 35, icon: '🎣' },
    { id: 'prepay', label: '선입금·수수료', max: 25, icon: '💸' },
    { id: 'messenger', label: '메신저 유도', max: 10, icon: '💬' },
    { id: 'direct', label: '직거래 회피', max: 10, icon: '🚚' },
    { id: 'pressure', label: '심리 압박', max: 5, icon: '⏰' }
  ];

  SD.RISK_RULES = {
    phishing: [
      { label: '안전결제 링크 유도', re: /안전\s*(?:결제|거래)\s*(?:링크|주소|url|사이트|페이지)/gi },
      { label: '외부 결제 링크', re: /(?:결제|구매|입금|주문)\s*(?:링크|url|주소|페이지)/gi },
      { label: '링크 결제 유도', re: /링크\s*(?:로|를\s*통해|에서|타고)\s*(?:결제|구매|주문|입금)/gi },
      { label: '페이 사칭 링크', re: /(?:네이버\s*페이|쿠팡|번개\s*페이|당근\s*페이|중고나라\s*페이)\s*(?:안전\s*)?(?:결제\s*)?링크/gi },
      { label: '에스크로 사이트 유도', re: /에스크로\s*(?:사이트|링크|업체)/gi },
      { label: '사칭 의심 도메인', re: /\b(?:bunjang|bungae|daangn|karrot|joongna|naver-?pay|npay|kakao-?pay)[-_.][a-z0-9-]+\.(?:shop|xyz|top|site|online|store|click|link|info|net|com|kr)\b/gi }
    ],
    prepay: [
      { label: '수고비 요구', re: /수고비/gi },
      { label: '수수료 (재)입금 요구', re: /수수료\s*(?:를\s*)?(?:재\s*)?입금/gi },
      { label: '재입금 요구', re: /재\s*입금|이중\s*입금|오\s*입금/gi },
      { label: '선입금 요구', re: /선\s*입금|입금\s*(?:먼저|부터)|먼저\s*입금/gi },
      { label: '예약금·보증금 요구', re: /예약금|보증금|계약금/gi },
      { label: '입금 후 발송 강요', re: /입금\s*확인\s*(?:후|되면)\s*(?:바로\s*)?(?:발송|배송)/gi }
    ],
    messenger: [
      { label: '카카오톡 유도', re: /카톡|카카오\s*톡|kakao\s*talk|오픈\s*(?:채팅|톡)/gi },
      { label: '텔레그램/라인 유도', re: /텔레그램|telegram|라인\s*(?:아이디|id)/gi },
      { label: '개인 아이디 노출', re: /(?:아이디|\bid)\s*[:：]?\s*[a-z][a-z0-9_.]{3,}/gi }
    ],
    direct: [
      { label: '직거래 불가', re: /직거래\s*(?:는\s*)?(?:불가|안\s*(?:돼|됩|되)|x|어려|힘들|못)/gi },
      { label: '택배거래만 고집', re: /택배\s*(?:거래)?\s*만\s*(?:가능|됩|해요)?|비대면\s*(?:거래)?\s*만/gi },
      { label: '부재 사유(군인·해외·출장)', re: /군인이라|군\s*복무\s*중|해외\s*(?:거주|체류|출장)|출장\s*중이라/gi }
    ],
    pressure: [
      { label: '시간 압박', re: /오늘\s*만(?![나원])|오늘까지만|선착순|지금\s*바로\s*(?:입금|결제)|빨리\s*(?:입금|결제|연락)/gi },
      { label: '경쟁 압박', re: /다른\s*분\s*(?:도|이)\s*(?:연락|대기|입금)|먼저\s*(?:입금|결제)\s*하시는\s*분/gi }
    ]
  };

  /* 외부 링크 허용 도메인 (플랫폼 공식 · 제조사) */
  SD.SAFE_DOMAINS = ['bunjang.co.kr', 'daangn.com', 'joongna.com', 'cafe.naver.com',
    'apple.com', 'samsung.com', 'checkcoverage.apple.com'];

  /* ---------- 거래 금지 · 불법 품목 키워드 사전 (감지 즉시 100점 · 시세 계산 중단) ---------- */
  SD.BANNED_KEYWORDS = [
    '처방약', '전문의약품', '수면제', '위고비', '나비약', '식욕억제제',
    '도수 렌즈', '도수 안경', '콘택트렌즈', '전자담배', '액상',
    '주류', '양주', '신분증 위조', '대포통장'
  ];

  SD.BANNED_WARN_MESSAGE =
    '전문의약품(처방약), 도수 있는 안경·콘택트렌즈, 전자담배, 주류 등은 현행법(약사법·의료기기법)상 온라인 개인 간 중고거래가 엄격히 금지된 불법 품목입니다. 구매 시 사기 피해는 물론 법적 불이익을 받을 수 있으니 즉시 거래를 중단하세요.';

  SD.BANNED_RULES = [
    {
      group: 'medical',
      title: '불법 의약품 및 거래금지 의료기기',
      warn: SD.BANNED_WARN_MESSAGE,
      res: [
        /처방\s*약|전문\s*의약품|의약품|수면제|위고비|삭센다|마운자로|나비\s*약|식욕\s*억제제|다이어트\s*(?:처방\s*)?약|졸피뎀|페노바르비탈|항생제|스테로이드|인슐린/gi,
        /도수\s*(?:있는\s*)?(?:일회용\s*|컬러\s*|써클\s*)?(?:렌즈|안경|선글라스)|콘택트\s*렌즈|일회용\s*렌즈/gi
      ]
    },
    {
      group: 'tobacco',
      title: '전자담배 · 니코틴 액상 (거래 금지 품목)',
      warn: SD.BANNED_WARN_MESSAGE,
      res: [/전자\s*담배|전담\s*액상|니코틴\s*액상|담배\s*액상|입호흡\s*액상|폐호흡\s*액상|(?:아이코스|릴\s*하이브리드|글로\s*하이퍼)\s*액상|액상\s*(?:처분|양도|판매|팝니다)/gi]
    },
    {
      group: 'alcohol',
      title: '주류 · 양주 (온라인 개인 거래 금지)',
      warn: SD.BANNED_WARN_MESSAGE,
      res: [/주류|양주|위스키\s*(?:판매|양도|처분|팝니다)|발렌타인\s*\d+년|맥캘란|로얄살루트/gi]
    },
    {
      group: 'illegal',
      title: '신분증 위조 · 대포통장 등 불법 금융/명의 거래',
      warn: SD.BANNED_WARN_MESSAGE,
      res: [/신분증\s*위조|위조\s*신분증|대포\s*통장|대포\s*폰|(?:통장|계좌|유심|명의|신분증|주민등록증)\s*(?:대여|양도|판매|매입|삽니다|팝니다)/gi]
    }
  ];

  /* ---------- 시연용 썸네일 (외부 이미지 의존 없이 SVG로 생성) ---------- */
  const svg = (s) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);

  const THUMB_IPHONE = svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9eef7"/><stop offset="1" stop-color="#c9d3e6"/></linearGradient>
<linearGradient id="body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7f8fa"/><stop offset=".5" stop-color="#d9dde3"/><stop offset="1" stop-color="#b9bfc8"/></linearGradient>
<linearGradient id="scr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b4c8c"/><stop offset="1" stop-color="#0f1f3d"/></linearGradient></defs>
<rect width="400" height="400" fill="url(#bg)"/>
<rect x="128" y="40" width="144" height="300" rx="26" fill="url(#body)" stroke="#a8afb9" stroke-width="2"/>
<rect x="138" y="88" width="124" height="204" rx="4" fill="url(#scr)"/>
<circle cx="200" cy="316" r="13" fill="none" stroke="#9aa1ab" stroke-width="3"/>
<rect x="182" y="62" width="36" height="5" rx="2.5" fill="#9aa1ab"/>
<circle cx="168" cy="64" r="4" fill="#7c838d"/>
<text x="200" y="196" font-family="sans-serif" font-size="20" font-weight="700" fill="#cfe0ff" text-anchor="middle">iPhone 8</text>
<text x="200" y="222" font-family="sans-serif" font-size="13" fill="#9fb6e0" text-anchor="middle">Silver · 64GB</text>
<rect x="18" y="356" width="120" height="28" rx="14" fill="#16a34a"/><text x="78" y="375" font-family="sans-serif" font-size="13" font-weight="700" fill="#fff" text-anchor="middle">DEMO · A급</text>
</svg>`);

  const THUMB_BUDS3PRO = svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eef2f9"/><stop offset="1" stop-color="#cfd8e8"/></linearGradient>
<linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e5e9f0"/><stop offset="1" stop-color="#b8c0ce"/></linearGradient></defs>
<rect width="400" height="400" fill="url(#bg)"/>
<rect x="102" y="105" width="196" height="165" rx="48" fill="url(#c)" stroke="#8b95a7" stroke-width="2.5"/>
<rect x="112" y="114" width="176" height="58" rx="26" fill="rgba(255,255,255,0.45)" stroke="#9aa3b4" stroke-width="1.5"/>
<line x1="106" y1="172" x2="294" y2="172" stroke="#7d8799" stroke-width="2"/>
<rect x="196" y="188" width="8" height="36" rx="4" fill="#38bdf8"/>
<text x="200" y="318" font-family="sans-serif" font-size="20" font-weight="800" fill="#1e293b" text-anchor="middle">Galaxy Buds3 Pro</text>
<rect x="18" y="356" width="156" height="28" rx="14" fill="#dc2626"/><text x="96" y="375" font-family="sans-serif" font-size="13" font-weight="700" fill="#fff" text-anchor="middle">DEMO · 미개봉 9만</text>
</svg>`);

  const THUMB_MEDICAL_BLOCKED = svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1e293b"/><stop offset="1" stop-color="#0f172a"/></linearGradient></defs>
<rect width="400" height="400" fill="url(#bg)"/>
<rect x="135" y="95" width="130" height="175" rx="22" fill="#334155" stroke="#64748b" stroke-width="2.5"/>
<rect x="165" y="135" width="70" height="16" rx="6" fill="#ef4444"/>
<rect x="192" y="108" width="16" height="70" rx="6" fill="#ef4444"/>
<text x="200" y="226" font-family="sans-serif" font-size="16" font-weight="700" fill="#e2e8f0" text-anchor="middle">Wegovy</text>
<text x="200" y="314" font-family="sans-serif" font-size="19" font-weight="800" fill="#f87171" text-anchor="middle">거래 금지 품목</text>
<text x="200" y="340" font-family="sans-serif" font-size="13" fill="#94a3b8" text-anchor="middle">비만치료제 위고비 · 전문의약품</text>
</svg>`);

  /* ---------- 시연용 프리셋 (URL에 safedeal-demo- 포함 시 내장 데이터 사용) ---------- */
  SD.DEMO_FIXTURES = {
    'safedeal-demo-iphone8': {
      title: '아이폰8 실버 64GB A급 팝니다',
      searchQuery: '아이폰8 64GB',
      price: 80000,
      image: THUMB_IPHONE,
      description:
        '아이폰8 실버 64GB 판매합니다.\n서브폰으로 쓰던 거라 기스 거의 없는 A급이에요.\n' +
        '배터리 성능 84%, 기능 이상 없습니다. 공기계 초기화 완료했어요.\n' +
        '박스는 없고 본체 + 충전 케이블 드립니다.\n이사 때문에 시세보다 조금 싸게 내놓아요.\n' +
        '역삼역 근처 직거래 선호하고, 반값택배도 가능합니다.',
      seller: '역삼동 · 매너온도 41.2℃'
    },
    'safedeal-demo-buds3pro': {
      title: '갤럭시 버즈3 프로 미개봉 새상품 급처 9만원',
      searchQuery: '갤럭시 버즈3 프로',
      price: 90000,
      image: THUMB_BUDS3PRO,
      description:
        '삼성 갤럭시 버즈3 프로 실버 미개봉 새상품입니다. 사은품으로 받았는데 안 써서 9만원에 급처해요.\n' +
        '직거래는 지방 출장 중이라 불가하고 택배거래만 합니다.\n' +
        '번개페이는 수수료가 아까워서 아래 안전결제 링크로 결제해 주시면 바로 발송합니다.\n' +
        '👉 http://bunjang-safepay.shop/pay?id=20311\n' +
        '문의는 카톡 아이디 buds2031 로 연락 주세요.',
      seller: '가입 2일 · 거래후기 0건'
    },
    'safedeal-demo-wegovy': {
      title: '비만치료제 위고비',
      price: 120000,
      image: THUMB_MEDICAL_BLOCKED,
      description:
        '병원에서 처방받은 비만치료제 위고비와 식욕억제제(나비약), 수면제 남은 분량 및 도수 렌즈(콘택트렌즈) 일괄로 급처합니다.\n' +
        '전문의약품이라 약국 방문 없이 바로 받으실 분만 연락 주세요.',
      seller: '익명 회원 · 거래후기 0건'
    }
  };

  SD.PRESETS = [
    { key: 'normal', url: 'https://www.daangn.com/kr/buy-sell/safedeal-demo-iphone8/' },
    { key: 'scam', url: 'https://m.bunjang.co.kr/products/safedeal-demo-buds3pro' },
    { key: 'banned', url: 'https://web.joongna.com/product/safedeal-demo-wegovy' }
  ];
})(window.SD);
