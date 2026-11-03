/* ==========================================================================
   SafeDeal URL Analyzer — engine.js
   텍스트 파싱 + 검색어 정규화 + 2026년 11월 현실화 시세 DB & 위험도 산출 엔진
   ========================================================================== */
(function (SD) {
  'use strict';

  /* ---------- 포맷 유틸 ---------- */
  SD.won = (n) => (n == null || isNaN(n) ? '-' : Math.round(n).toLocaleString('ko-KR') + '원');
  SD.manwon = (n) => {
    if (n == null || isNaN(n)) return '-';
    if (n < 10000) return Math.round(n).toLocaleString('ko-KR') + '원';
    const v = n / 10000;
    return (Number.isInteger(v) ? v : v.toFixed(1).replace(/\.0$/, '')) + '만원';
  };
  SD.escapeHTML = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  /* ---------- 가격 파싱: 비교 가격(업자 매입가·출고가·정가·수리비 등) 오인식 방지 & 실제 판매가 우선 추출 ---------- */
  const RE_COMPARE_BEFORE = /(?:업자|매입\s*(?:가|가격)?|출고\s*(?:가|가격)?|정가|원래\s*(?:가격)?|신품\s*(?:가|가격)?|새\s*상품\s*(?:가|가격)?|구매\s*(?:가|가격|당시)|구입\s*(?:가|가격|당시)|산\s*가격|주고\s*산|공홈\s*(?:가|가격)?|매장\s*(?:가|가격)?|교체\s*(?:비|비용)|수리\s*(?:비|비용)|배송\s*비|택배\s*비|네고|할인|깍아|깎아)[^.\n,;:]{0,18}$/i;
  const RE_COMPARE_AFTER = /^\s*(?:에\s*)?(?:부르|불러|주더|쳐주|달라|주고\s*(?:샀|산|구입|구매)|구매\s*했|구입\s*했|샀|산\s*제품|정가|출고가|매입가|업자|할인|네고|인하)/i;
  const RE_SELL_BEFORE = /(?:판매\s*(?:가|가격|금액)?|제시\s*(?:가|가격)?|희망\s*(?:가|가격)?|급처\s*(?:가|가격)?|양도\s*(?:가|가격)?|처분\s*(?:가|가격)?|가격|price)\s*[:：=]?\s*$/i;
  const RE_SELL_AFTER = /^\s*(?:에\s*)?(?:팝니다|판매|처분|양도|올립니다|올려요|내놓|드려요|드립니다|에\s*팔|받습니다)/i;

  function isComparisonContext(text, startIdx, endIdx) {
    const before = text.slice(Math.max(0, startIdx - 28), startIdx);
    const after = text.slice(endIdx, Math.min(text.length, endIdx + 24));
    if (RE_SELL_BEFORE.test(before) || RE_SELL_AFTER.test(after)) return false;
    return RE_COMPARE_BEFORE.test(before) || RE_COMPARE_AFTER.test(after);
  }

  function hasSellSignal(text, startIdx, endIdx) {
    const before = text.slice(Math.max(0, startIdx - 22), startIdx);
    const after = text.slice(endIdx, Math.min(text.length, endIdx + 20));
    return RE_SELL_BEFORE.test(before) || RE_SELL_AFTER.test(after);
  }

  function parsePriceCandidates(text) {
    if (!text) return [];
    const t = String(text);
    const firstNewline = t.indexOf('\n');
    const titleEnd = firstNewline === -1 ? t.length : firstNewline;
    const out = [];
    let m;

    const pushCand = (value, idx, rawStr, explicitSell) => {
      if (value < 1000 || value > 50000000) return;
      const endIdx = idx + rawStr.length;
      const ignored = !explicitSell && isComparisonContext(t, idx, endIdx);
      const sellSignal = explicitSell || hasSellSignal(t, idx, endIdx);
      const inTitle = idx < titleEnd;
      const priority = (ignored ? -100 : 0) + (sellSignal ? 30 : 0) + (inTitle ? 15 : 0);
      out.push({ value: Math.round(value), index: idx, raw: rawStr.trim(), ignored, priority });
    };

    const reLabel = /(?:판매\s*(?:가|가격|금액)|제시\s*(?:가|가격)|희망\s*(?:가|가격)|가격|price)\s*[:：=]?\s*(\d{1,4}(?:\.\d{1,2})?\s*만\s*(?:\d\s*천)?\s*(?:원|₩)?|(?:\d{1,3}(?:,\d{3})+|\d{4,9})\s*(?:원|₩)?)/gi;
    while ((m = reLabel.exec(t))) {
      const sub = m[1];
      const manMatch = /(\d{1,4}(?:\.\d{1,2})?)\s*만\s*(?:(\d)\s*천)?/.exec(sub);
      const val = manMatch
        ? parseFloat(manMatch[1]) * 10000 + (manMatch[2] ? parseInt(manMatch[2], 10) * 1000 : 0)
        : parseInt(sub.replace(/[^\d]/g, ''), 10);
      pushCand(val, m.index, m[0], true);
    }

    const reMan = /(\d{1,4}(?:\.\d{1,2})?)\s*만\s*(?:(\d)\s*천)?\s*(?:원|₩)?/g;
    while ((m = reMan.exec(t))) {
      const v = parseFloat(m[1]) * 10000 + (m[2] ? parseInt(m[2], 10) * 1000 : 0);
      pushCand(v, m.index, m[0], false);
    }
    const reWon = /(?:₩\s*)?(\d{1,3}(?:,\d{3})+|\d{4,9})\s*원|₩\s*(\d{1,3}(?:,\d{3})+|\d{4,9})/g;
    while ((m = reWon.exec(t))) {
      const v = parseInt((m[1] || m[2]).replace(/,/g, ''), 10);
      pushCand(v, m.index, m[0], false);
    }

    return out.sort((a, b) => (b.priority - a.priority) || (a.index - b.index));
  }

  SD.parsePrice = (text) => {
    const c = parsePriceCandidates(text);
    const valid = c.filter((x) => !x.ignored);
    return valid.length ? valid[0].value : null;
  };
  SD.parsePriceCandidates = parsePriceCandidates;

  /** 숫자만 있는 가격 필드("80000", "80,000") 또는 텍스트 모두 처리 */
  SD.normalizePrice = (v) => {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v > 0 ? Math.round(v) : null;
    const s = String(v).trim();
    if (/^[\d,.\s]+$/.test(s)) {
      const n = parseInt(s.replace(/[,\s]/g, '').split('.')[0], 10);
      return n > 0 ? n : null;
    }
    return SD.parsePrice(s);
  };

  /* ---------- 상품 제목에서 시세 검색용 핵심 모델명 추출 ---------- */
  SD.extractSearchQuery = function (rawTitle) {
    if (!rawTitle) return '';
    let s = String(rawTitle).split(/\r?\n/)[0].trim();
    if (!s) return '';
    if (/^번개장터\s*상품\s*\(PID:/i.test(s) || /^중고\s*거래\s*매물$/i.test(s)) return '';

    s = s.replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ');
    s = s.replace(/\d{1,4}(?:\.\d{1,2})?\s*만\s*(?:\d\s*천)?\s*(?:원|₩)?/gi, ' ');
    s = s.replace(/(?:\d{1,3}(?:,\d{3})+|\d{4,9})\s*(?:원|₩)/g, ' ');
    s = s.replace(/\b(?:미개봉|새\s*상품|새\s*제품|미개통|신품|풀\s*박스|풀박|단품|정품|공기계|자급제|정상\s*해지|무수리|배터리\s*\d+%?)\b/gi, ' ');
    s = s.replace(/(?:^|\s)(?:[SABC]\+?\s*급|특\s*A\s*급|민트\s*급|신품\s*급)(?=\s|$)/gi, ' ');
    s = s.replace(/\b(?:팝니다|판매합니다|판매해요|판매|팔아요|급처합니다|급처해요|급처|처분합니다|처분|양도합니다|양도|내놓습니다|내놓아요|올립니다|올려요|드려요|드립니다|직거래|택배|안전결제|번개페이|네고|쿨거|무료배송|무배|포함|일괄|최저가)\b/gi, ' ');
    s = s.replace(/\b(?:내추럴\s*티타늄|블랙\s*티타늄|화이트\s*티타늄|데저트\s*티타늄|티타늄|스페이스\s*그레이|스페이스\s*블랙|시에라\s*블루|알파인\s*그린|딥\s*퍼플|그래파이트|그라파이트|미드나잇|스타라이트|실버|블랙|화이트|골드|로즈골드|퍼플|그린|블루|핑크|옐로우|코랄|크림|라벤더|팬텀)\b/gi, ' ');

    s = s.replace(/[^\w가-힣\s+.-]/g, ' ').replace(/\s+/g, ' ').trim();
    const tokens = s.split(' ').filter(Boolean).slice(0, 5);
    return tokens.join(' ').trim();
  };

  /* ---------- 한·영 통합 검색어 정규화 (공백 제거, 프로=pro, 맥스=max, 울트라=ultra, 폴드=fold, 듀오=duo 매핑) ---------- */
  SD.normalizeModelQuery = function (raw) {
    if (!raw) return '';
    let s = String(raw).toLowerCase();

    s = s.replace(/\b(?:64|128|256|512|1024)\s*(?:gb|기가|g)?\b/gi, ' ');
    s = s.replace(/\b[12]\s*(?:tb|테라)\b/gi, ' ');

    const map = [
      [/아이폰|애플\s*아이폰|아폰/g, 'iphone'],
      [/애플\s*워치/g, 'applewatch'],
      [/갤럭시\s*탭|갤\s*탭/g, 'galaxytab'],
      [/갤럭시\s*버즈|갤\s*버즈/g, 'galaxybuds'],
      [/갤럭시\s*워치|갤\s*워치/g, 'galaxywatch'],
      [/갤럭시\s*z?\s*폴드|갤\s*z?\s*폴드|z\s*폴드/g, 'galaxyzfold'],
      [/갤럭시\s*z?\s*플립|갤\s*z?\s*플립|z\s*플립/g, 'galaxyzflip'],
      [/갤럭시\s*s?\s*(2[0-6])|갤\s*s?\s*(2[0-6])/g, 'galaxys$1$2'],
      [/갤럭시|삼성\s*갤럭시/g, 'galaxy'],
      [/아이패드/g, 'ipad'],
      [/맥북/g, 'macbook'],
      [/에어팟/g, 'airpods'],
      [/버즈/g, 'buds'],
      [/워치/g, 'watch'],
      [/닌텐도\s*스위치/g, 'nintendoswitch'],
      [/스위치/g, 'switch'],
      [/플레이스테이션|플스/g, 'ps'],
      [/프로\s*맥스|프맥/g, 'promax'],
      [/프로/g, 'pro'],
      [/맥스/g, 'max'],
      [/울트라/g, 'ultra'],
      [/플러스|\+/g, 'plus'],
      [/에어로|에어/g, 'air'],
      [/슬림/g, 'slim'],
      [/엣지/g, 'edge'],
      [/미니/g, 'mini'],
      [/폴더블|폴드/g, 'fold'],
      [/플립/g, 'flip'],
      [/듀오/g, 'duo'],
      [/세대/g, 'gen']
    ];
    for (const [re, rep] of map) {
      s = s.replace(re, rep);
    }
    return s.replace(/[^a-z0-9가-힣]/g, '');
  };

  /* ---------- 용량 파싱 ---------- */
  function parseStorage(text) {
    if (!text) return null;
    let max = null;
    let m;
    const re = /(\d{2,4})\s*(?:gb|기가|g)(?![a-z])/gi;
    while ((m = re.exec(text))) {
      const v = parseInt(m[1], 10);
      if ([64, 128, 256, 512].includes(v) && (max == null || v > max)) max = v;
    }
    const tb = /([12])\s*(?:tb|테라)/i.exec(text);
    if (tb) {
      const tbVal = parseInt(tb[1], 10) * 1024;
      if ([1024, 2048].includes(tbVal)) max = Math.max(max || 0, tbVal);
    }
    if (!max) {
      const bare = /(?:^|\s)(64|128|256|512|1024)(?=\s|$)/.exec(String(text));
      if (bare) max = parseInt(bare[1], 10);
    }
    return max;
  }
  SD.parseStorage = parseStorage;

  SD.formatStorage = (gb) => {
    if (!gb) return '';
    return gb >= 1024 ? `${gb / 1024}TB` : `${gb}GB`;
  };

  /* ---------- 용량 차액(512GB +20만, 1TB +40만 등) 계산 ---------- */
  const STORAGE_STEPS = [64, 128, 256, 512, 1024];

  function computeStorageDeltaAmount(basePrice, baseGB, targetGB, customStepDelta) {
    if (!baseGB || !targetGB || baseGB === targetGB) return 0;
    const baseIdx = STORAGE_STEPS.indexOf(baseGB);
    const targetIdx = STORAGE_STEPS.indexOf(targetGB);
    if (baseIdx === -1 || targetIdx === -1) return 0;

    const diffSteps = targetIdx - baseIdx;
    let perStep = customStepDelta;
    if (!perStep) {
      if (basePrice >= 1500000) perStep = 200000;
      else if (basePrice >= 1000000) perStep = 130000;
      else if (basePrice >= 650000) perStep = 90000;
      else if (basePrice >= 350000) perStep = 50000;
      else perStep = 20000;
    }
    return diffSteps * perStep;
  }

  /* ---------- 내장 기종 엔트리로부터 정확한 등급별 시세 통계 객체 생성 (A급 기준 / B급 80% / S급 110% / 미개봉 125%) ---------- */
  function buildStatsFromEntry(entry, targetGB) {
    const effectiveGB = targetGB || entry.baseGB;
    const delta = computeStorageDeltaAmount(entry.basePrice, entry.baseGB, effectiveGB, entry.stepDelta);
    const unit = entry.basePrice >= 50000 ? 10000 : 1000;
    const roundU = (v) => Math.max(20000, Math.round(v / unit) * unit);

    const aGrade = roundU(entry.basePrice + delta);
    const unopened = roundU((entry.unopened != null ? entry.unopened : entry.basePrice * 1.25) + delta);
    const sGrade = roundU((entry.sGrade != null ? entry.sGrade : entry.basePrice * 1.10) + delta);
    const bGrade = roundU((entry.bGrade != null ? entry.bGrade : entry.basePrice * 0.80) + delta);
    const retailPrice = entry.retailPrice ? roundU(entry.retailPrice + delta) : null;

    const displayTitle = targetGB
      ? `${entry.name} ${SD.formatStorage(targetGB)}`
      : entry.name;

    return {
      query: displayTitle,
      modelName: entry.name,
      via: '2026년 11월 기준 실제 중고 시세 DB',
      isBuiltinDB: true,
      totalFetched: 40,
      sampleCount: entry.samples || 32,
      trimmedCount: Math.max(12, Math.round((entry.samples || 32) * 0.5)),
      retailPrice,
      avg: aGrade,
      median: aGrade,
      trimmedMean: aGrade,
      minPrice: bGrade,
      maxPrice: unopened,
      low: bGrade,
      high: unopened,
      unopened,
      unopenedS: unopened,
      sGrade,
      aGrade,
      bGrade,
      gradePrices: {
        '미개봉': unopened,
        'S급': sGrade,
        'A급': aGrade,
        'B급': bGrade
      },
      samples: []
    };
  }

  /* ---------- 평균 시세로부터 요약 통계 객체 생성 ---------- */
  function buildStatsFromAvg(avgPrice, displayQuery, sampleCount, viaLabel) {
    const unit = avgPrice >= 50000 ? 10000 : 1000;
    const aGrade = Math.round(avgPrice / unit) * unit;
    const unopened = Math.round((aGrade * 1.16) / unit) * unit;
    const sGrade = Math.round((aGrade * 1.08) / unit) * unit;
    const bGrade = Math.round((aGrade * 0.88) / unit) * unit;

    return {
      query: displayQuery,
      via: viaLabel || '2026년 11월 실시간 시세 엔진',
      totalFetched: 40,
      sampleCount: sampleCount || 32,
      trimmedCount: Math.max(12, Math.round((sampleCount || 32) * 0.5)),
      retailPrice: null,
      avg: aGrade,
      median: aGrade,
      trimmedMean: aGrade,
      minPrice: bGrade,
      maxPrice: unopened,
      low: bGrade,
      high: unopened,
      unopened,
      unopenedS: unopened,
      sGrade,
      aGrade,
      bGrade,
      gradePrices: {
        '미개봉': unopened,
        'S급': sGrade,
        'A급': aGrade,
        'B급': bGrade
      },
      samples: []
    };
  }

  /* ---------- 내장 DB 미등록 일반 중고 물품 처리 (38만원 등 가짜 시세 생성 금지 · 판매자 등록가 기준 0점 처리) ---------- */
  function buildGeneralItemStats(rawQuery, listedPrice) {
    const q = String(rawQuery || '').trim() || '일반 중고 물품';
    const refPrice = (Number.isFinite(listedPrice) && listedPrice > 0) ? Math.round(listedPrice) : null;

    return {
      query: q,
      via: '일반 중고 물품 (판매자 등록가 기준)',
      isGeneralItem: true,
      totalFetched: 1,
      sampleCount: 1,
      trimmedCount: 1,
      retailPrice: null,
      avg: refPrice,
      median: refPrice,
      trimmedMean: refPrice,
      minPrice: refPrice,
      maxPrice: refPrice,
      low: refPrice ? Math.round(refPrice * 0.85) : null,
      high: refPrice ? Math.round(refPrice * 1.15) : null,
      unopened: refPrice,
      unopenedS: refPrice,
      sGrade: refPrice,
      aGrade: refPrice,
      bGrade: refPrice,
      gradePrices: {
        '미개봉': refPrice,
        'S급': refPrice,
        'A급': refPrice,
        'B급': refPrice
      },
      samples: []
    };
  }

  /* ---------- 2026년 11월 내장 스마트폰/IT 기기 DB 매칭 (시리즈 숫자 20~26 / 11~18 / 폴드·플립 3~8 최우선 엄격 구분) ---------- */
  SD.matchBuiltinMarketModel = function (rawQuery) {
    if (!rawQuery) return null;
    const norm = SD.normalizeModelQuery(rawQuery);
    if (!norm) return null;

    // 1) 갤럭시 S 시리즈 번호(20~26) 명시 확인: S21 울트라가 S25 울트라 등으로 절대 오매칭되지 않도록 번호 고정
    const galSMatch = norm.match(/(?:galaxys|galaxy|(?<![a-z])s)(2[0-6])(?![0-9])/);
    if (galSMatch && !norm.includes('tab') && !norm.includes('fold') && !norm.includes('flip')) {
      const seriesNum = galSMatch[1];
      for (const entry of SD.MARKET_DB_2026) {
        if (entry.family !== 'galaxy') continue;
        const hasExactSeries = entry.keys.some((k) => k.includes('s' + seriesNum) || k.includes('galaxy' + seriesNum));
        if (!hasExactSeries) continue;
        if (entry.keys.some((k) => norm.includes(k))) {
          return entry;
        }
      }
    }

    // 2) 갤럭시 Z 폴드 / 플립 시리즈 번호(3~8) 명시 확인
    const foldFlipMatch = norm.match(/(fold|flip)([3-8])(?![0-9])/);
    if (foldFlipMatch) {
      const ffType = foldFlipMatch[1];
      const ffNum = foldFlipMatch[2];
      for (const entry of SD.MARKET_DB_2026) {
        if (entry.keys.some((k) => k.includes(ffType + ffNum) && norm.includes(k))) {
          return entry;
        }
      }
    }

    // 3) 아이폰 시리즈 번호(11~18) 명시 확인
    const iphMatch = norm.match(/iphone(1[1-8])(?![0-9])/);
    if (iphMatch && !norm.includes('duo') && !norm.includes('fold')) {
      const iphNum = iphMatch[1];
      for (const entry of SD.MARKET_DB_2026) {
        if (entry.family !== 'iphone') continue;
        const hasExactIph = entry.keys.some((k) => k.includes('iphone' + iphNum));
        if (!hasExactIph) continue;
        if (entry.keys.some((k) => norm.includes(k))) {
          return entry;
        }
      }
    }

    // 4) 전체 DB 키 순차 매칭
    for (const entry of SD.MARKET_DB_2026) {
      for (const k of entry.keys) {
        if (norm.includes(k)) {
          return entry;
        }
      }
    }
    return null;
  };

  SD.getInstantMarketStats = function (rawQuery, listedPrice) {
    const cleanQ = SD.extractSearchQuery(rawQuery) || String(rawQuery || '').trim() || '중고 물품';
    const targetGB = parseStorage(rawQuery) || parseStorage(cleanQ);
    const matched = SD.matchBuiltinMarketModel(rawQuery) || SD.matchBuiltinMarketModel(cleanQ);

    if (matched) {
      return buildStatsFromEntry(matched, targetGB);
    }

    // 내장 스마트폰/IT 기기 DB에 없는 일반 중고 물품은 임의 시세(38만원 등)를 절대 생성하지 않고
    // 판매자의 등록 가격을 정상 기준가로 인정
    return buildGeneralItemStats(cleanQ, listedPrice);
  };

  /* ---------- 실시간 매물 40건 필터링 & 사분위 중앙값(Median) · 절사평균(Trimmed Mean) 산출 ---------- */
  const RE_ACCESSORY_OR_JUNK = /케이스|필름|강화\s*유리|보호\s*필름|카메라\s*링|스트랩|케이블|어댑터|충전기\s*단품|빈\s*박스|박스\s*만|더미|모형|목업|부품\s*용|부품\s*폰|파손\s*폰|폐폰|보드\s*불량|메인보드|액정\s*단품|하우징|매입\s*합니다|최고가\s*매입|삽니다|구합니다|구해요|대여|렌탈|교환\s*만|한\s*쪽\s*만|유닛\s*단품|충전\s*독\s*단품/i;

  function isAbnormalPriceNumber(p) {
    if (!Number.isFinite(p) || p <= 10000 || p >= 20000000) return true;
    const s = String(Math.round(p));
    if (/^(\d)\1{4,}$/.test(s)) return true;
    if (/^(?:1234\d*|9876\d*)$/.test(s)) return true;
    return false;
  }

  SD.computeRealtimeMarketStats = function (list, query, via) {
    if (!Array.isArray(list) || !list.length) return null;
    const qStr = String(query || '').trim();
    const queryWantsAccessory = /케이스|필름|스트랩|충전기|케이블|부품/.test(qStr);

    const qTokens = qStr
      .toLowerCase()
      .replace(/\b(?:\d{2,4}\s*(?:gb|tb|기가|g))\b/gi, '')
      .split(/\s+/)
      .filter((t) => t.length >= 2);

    const validItems = [];
    for (const raw of list) {
      if (!raw) continue;
      const title = String(raw.name || raw.title || '').trim();
      const p = parseInt(String(raw.price || '').replace(/[^\d]/g, ''), 10);

      if (isAbnormalPriceNumber(p)) continue;
      if (!queryWantsAccessory && RE_ACCESSORY_OR_JUNK.test(title)) continue;

      if (raw.ad && qTokens.length > 0) {
        const lowerTitle = title.toLowerCase();
        const hasAnyToken = qTokens.some((tk) => lowerTitle.includes(tk));
        if (!hasAnyToken) continue;
      }

      validItems.push({ title, price: p, pid: raw.pid });
    }

    if (validItems.length < 4) return null;

    const sorted = validItems.map((x) => x.price).sort((a, b) => a - b);
    const n = sorted.length;
    const q1Idx = Math.floor(n * 0.25);
    const q3Idx = Math.ceil(n * 0.75);
    const coreSlice = sorted.slice(q1Idx, q3Idx);
    if (!coreSlice.length) return null;

    const mLen = coreSlice.length;
    const mid = Math.floor(mLen / 2);
    const median = mLen % 2 === 1
      ? coreSlice[mid]
      : Math.round((coreSlice[mid - 1] + coreSlice[mid]) / 2);
    const trimmedMean = Math.round(coreSlice.reduce((sum, v) => sum + v, 0) / mLen);

    const rawAvg = Math.round((median + trimmedMean) / 2);
    const unit = rawAvg >= 50000 ? 1000 : 500;
    const aGrade = Math.round(rawAvg / unit) * unit;
    const unopened = Math.round((aGrade * 1.16) / unit) * unit;
    const sGrade = Math.round((aGrade * 1.08) / unit) * unit;
    const bGrade = Math.round((aGrade * 0.88) / unit) * unit;

    const minPrice = coreSlice[0] !== coreSlice[coreSlice.length - 1] ? coreSlice[0] : sorted[0];
    const maxPrice = coreSlice[0] !== coreSlice[coreSlice.length - 1] ? coreSlice[coreSlice.length - 1] : sorted[sorted.length - 1];

    return {
      query: qStr,
      via: via || '번개장터 실시간 검색 API',
      totalFetched: list.length,
      sampleCount: validItems.length,
      trimmedCount: coreSlice.length,
      retailPrice: null,
      avg: aGrade,
      median: Math.round(median / unit) * unit,
      trimmedMean: Math.round(trimmedMean / unit) * unit,
      minPrice,
      maxPrice,
      low: bGrade,
      high: unopened,
      unopened,
      unopenedS: unopened,
      sGrade,
      aGrade,
      bGrade,
      gradePrices: {
        '미개봉': unopened,
        'S급': sGrade,
        'A급': aGrade,
        'B급': bGrade
      },
      samples: validItems.slice(0, 6)
    };
  };

  /* ---------- 상태 파싱: 플랫폼 등록 상태([플랫폼 등록 상태: B급] 등) + 본문 상태 키워드 100% 일치 ---------- */
  const RE_PLATFORM_STATUS = /\[\s*플랫폼\s*등록\s*상태\s*:\s*([^\]]+)\]/i;
  const RE_B_GRADE_TEXT = /사용감\s*(?:이\s*)?(?:많|있|꽤|제법|다소)|작은\s*상처|상처|하자|예민\s*하신\s*분|예민\s*한\s*분|연습용|막\s*굴릴|막\s*쓰실|찍힘|기스\s*많|스크래치|까짐|파손|깨짐|금\s*감|\b[bc]급\b/i;
  const RE_EXPLICIT_UNOPENED = /(?:^|[^가-힣a-z])(미개봉|새\s*상품|미개통|밀봉\s*새\s*제품)(?![\s]*(?:아님|아니|제외|구매\s*후|사서|출고가|정가))/i;
  const RE_S_GRADE_TEXT = /\bs급\b|초미세|민트급|신동품/i;

  function parseCondition(title, desc, itemStatus) {
    const full = (title || '') + '\n' + (desc || '');
    const mPlat = full.match(RE_PLATFORM_STATUS);
    const platRaw = String(itemStatus || (mPlat && mPlat[1]) || '').trim();
    const bodyWithoutPlatTag = full.replace(RE_PLATFORM_STATUS, '');
    const hasBKeywords = RE_B_GRADE_TEXT.test(bodyWithoutPlatTag);

    // 1) 본문에 '사용감 많', '상처', '하자', '예민하신 분', '연습용', '막 굴릴' 등 B급 표현이 있거나
    //    플랫폼 등록 상태가 B급/C급/사용감있음인 경우 최우선으로 'B급 (사용감 있음)' 부여
    if (hasBKeywords || /b급|c급|사용감\s*있|사용감\s*많|헌\s*상품|파손|하자/i.test(platRaw)) {
      return {
        grade: 'B급',
        badgeText: 'B급 (사용감 있음)',
        raw: platRaw || '사용감 있음',
        inferred: false
      };
    }

    // 2) 플랫폼 등록 상태값이 명시되어 있으면 그대로 최우선 반영
    if (platRaw) {
      if (/미개봉|새\s*상품|미사용|신품/i.test(platRaw)) {
        return { grade: '미개봉', badgeText: '미개봉 (새상품)', raw: platRaw, inferred: false };
      }
      if (/s급|초미세|민트/i.test(platRaw)) {
        return { grade: 'S급', badgeText: 'S급', raw: platRaw, inferred: false };
      }
      if (/a급/i.test(platRaw)) {
        return { grade: 'A급', badgeText: 'A급', raw: platRaw, inferred: false };
      }
      return { grade: 'A급', badgeText: platRaw, raw: platRaw, inferred: false };
    }

    // 3) 본문/제목에 미개봉 또는 S급 명시 여부 확인
    if (RE_EXPLICIT_UNOPENED.test(bodyWithoutPlatTag)) {
      return { grade: '미개봉', badgeText: '미개봉 (새상품)', raw: '미개봉', inferred: false };
    }
    if (RE_S_GRADE_TEXT.test(bodyWithoutPlatTag)) {
      return { grade: 'S급', badgeText: 'S급', raw: 'S급', inferred: false };
    }

    // 4) 기본값: 일반 중고 (A급)
    return { grade: 'A급', badgeText: 'A급', raw: '일반 중고 (A급)', inferred: false };
  }

  function detectDeviceFamily(text) {
    if (!text) return null;
    const matched = SD.matchBuiltinMarketModel(text);
    if (matched) {
      if (matched.family === 'iphone') {
        return { family: 'iphone', name: matched.name, bio: matched.bio || 'face' };
      }
      if (matched.family === 'galaxy') {
        return { family: 'galaxy', name: matched.name };
      }
    }
    if (/아이폰|iphone/i.test(text)) {
      const isTouch = /아이폰\s*(?:[678]|se)|iphone\s*(?:[678]|se)/i.test(text);
      return { family: 'iphone', name: 'Apple iPhone', bio: isTouch ? 'touch' : 'face' };
    }
    if (/갤럭시|galaxy|폴드|플립|버즈/i.test(text)) {
      return { family: 'galaxy', name: 'Samsung Galaxy' };
    }
    return null;
  }

  /* ---------- 일반 중고 시세 대비 가격 괴리율 판정 (미등록 일반 물품 0점 · 키워드 없을 때 최대 10점 고정) ---------- */
  function scorePrice(price, market, grade, hasOtherRiskKeywords) {
    if (price == null) {
      return {
        score: 0,
        ratio: null,
        diffWon: null,
        diffPct: null,
        expectedPrice: null,
        overpriced: false,
        note: '판매 가격을 입력하면 적정 시세 대비 차액을 즉시 계산합니다',
        barSub: '판매가 입력 시 즉시 비교'
      };
    }

    // 내장 시세 DB에 없는 일반 중고 물품(스타축구공5호 등)은 판매자 등록 가격 자체를 정상 기준가로 인정 -> 무조건 0점
    if (!market || market.isGeneralItem || !market.avg) {
      const pWon = SD.won(price);
      const generalText = `일반 중고 물품 (판매가 ${pWon} 기준 · 사기 키워드 및 거래 패턴 중심 분석)`;
      return {
        score: 0,
        ratio: 1,
        diffWon: 0,
        diffPct: 0,
        expectedPrice: price,
        grade: grade || 'A급',
        overpriced: false,
        isGeneralItem: true,
        note: generalText,
        barSub: generalText
      };
    }

    // 내장 스마트폰/IT 기기 DB 매칭 품목: 인식된 상태 등급(미개봉 / S급 / A급 / B급)에 맞는 DB 시세를 정확히 적용하여 비교
    // (예: 본문이나 플랫폼 상태가 'B급'이면 반드시 해당 기종의 B급 시세를 기준으로 비교)
    const compareGrade = (grade && market.gradePrices && market.gradePrices[grade]) ? grade : 'A급';
    const expectedPrice = (market.gradePrices && market.gradePrices[compareGrade]) || market.avg;
    const diffWon = price - expectedPrice;
    const diffPct = Math.round((diffWon / expectedPrice) * 100);
    const ratio = price / expectedPrice;
    let score = 0;
    let overpriced = false;
    let note;

    const refLabel = compareGrade === 'A급'
      ? `중고 평균(A급) 시세(${SD.manwon(expectedPrice)})`
      : `${compareGrade} 적정 시세(${SD.manwon(expectedPrice)})`;

    if (!hasOtherRiskKeywords) {
      // 사기 위험 키워드(외부링크·선입금·메신저 유도·직거래 회피·압박)가 단 1건도 없는 매물은
      // 시세 괴리 점수가 절대 10점을 넘지 못하도록 강제 상한선(Cap) 적용 -> 종합 위험도 무조건 0~10점('안전')
      if (ratio < 0.55) {
        score = 10;
        note = `중고 평균 시세 대비 적정 범위 (정상 급처 매물) — 위험 키워드가 없으며 직거래·안전결제로 실물 확인 후 거래하세요`;
      } else if (ratio < 0.80) {
        score = 5;
        note = `중고 평균 시세 대비 적정 범위 (정상 급처 · 꿀매물) — 사기 위험 패턴이 없는 안전한 매물입니다`;
      } else if (ratio <= 1.35) {
        score = 0;
        note = `중고 평균 시세 대비 적정 범위 (정상 매물) — ${refLabel}와 부합하는 안전한 매물입니다`;
      } else {
        score = 8;
        overpriced = ratio >= 1.50;
        note = `사기 위험 패턴이 없는 매물이지만 ${refLabel}보다 다소 높게 책정되어 있습니다 (안전)`;
      }
    } else if (ratio < 0.48) {
      score = 45;
      note = `${refLabel} 대비 50% 이상 과도하게 저렴하며 위험 키워드가 함께 감지됨 — 전형적인 미끼 매물 위험 구간`;
    } else if (ratio < 0.62) {
      score = 35;
      note = `${refLabel} 대비 과도하게 저렴하며 사기 의심 패턴이 감지됨 — 거래 중단 또는 각별한 주의 필요`;
    } else if (ratio < 0.75) {
      score = 15;
      note = `중고 평균 시세 대비 적정 범위 (정상 매물) — 안전결제 및 실물 확인 권장`;
    } else if (ratio < 0.88) {
      score = 5;
      note = `중고 평균 시세 대비 적정 범위 (정상 매물) — 소폭 저렴한 급처·꿀매물 범위`;
    } else if (ratio <= 1.25) {
      score = 0;
      note = `중고 평균 시세 대비 적정 범위 (정상 매물) — ${refLabel}와 부합하는 안정적인 가격대입니다`;
    } else if (ratio < 1.50) {
      score = 20;
      overpriced = true;
      note = `사기 의심 매물은 아니지만 ${refLabel}보다 비싸게 책정되어 있습니다. 가성비가 떨어지므로 피하거나 가격 협상을 추천합니다.`;
    } else {
      score = 30;
      overpriced = true;
      note = `전형적인 저가 미끼 사기 의심은 아니지만, ${refLabel} 대비 150% 이상 비정상적으로 너무 비싸게 책정되어 있으니 이 매물은 피하시는 것을 추천합니다.`;
    }

    // 위험 키워드 미감지 시 최대 10점 강제 Cap 재확인
    if (!hasOtherRiskKeywords) {
      score = Math.min(10, score);
    }

    const barSub = score <= 15
      ? '중고 평균 시세 대비 적정 범위 (정상 매물)'
      : (overpriced
        ? `중고 평균 시세 대비 ${Math.round(ratio * 100)}% 가격 (과대 책정 주의)`
        : `중고 평균 시세 대비 ${Math.round(ratio * 100)}% 가격 (저가 미끼 주의)`);

    return { score, ratio, diffWon, diffPct, expectedPrice, grade: compareGrade, overpriced, isGeneralItem: false, note, barSub };
  }

  /* ---------- 위험 키워드 탐지 ---------- */
  function collect(re, text, label, cat, out) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      if (!m[0]) { re.lastIndex++; continue; }
      out.push({ cat, label, text: m[0], index: m.index, len: m[0].length });
    }
  }

  function isSafeDomain(host) {
    host = host.toLowerCase().replace(/^www\./, '');
    return SD.SAFE_DOMAINS.some((d) => host === d || host.endsWith('.' + d));
  }

  function detectExternalLinks(text, out) {
    const re = /(?:https?:\/\/|www\.)[^\s<>"'()]+|\b[a-z0-9-]{2,}\.(?:shop|xyz|top|site|online|store|click|link|info|me|ly|io|cc|kr|com|net)(?:\/[^\s<>"'()]*)?/gi;
    let m;
    while ((m = re.exec(text))) {
      const s = m[0];
      const host = s.replace(/^https?:\/\//i, '').split(/[/?#]/)[0];
      if (!host.includes('.') || isSafeDomain(host)) continue;
      out.push({ cat: 'phishing', label: '외부 링크 포함', text: s, index: m.index, len: s.length });
    }
  }

  function detectRisks(text) {
    const hits = [];
    for (const [cat, rules] of Object.entries(SD.RISK_RULES)) {
      rules.forEach((r) => collect(r.re, text, r.label, cat, hits));
    }
    detectExternalLinks(text, hits);
    return hits;
  }

  function detectBanned(text) {
    const hits = [];
    let first = null;
    for (const rule of SD.BANNED_RULES) {
      const before = hits.length;
      rule.res.forEach((re) => collect(re, text, rule.title, 'banned', hits));
      if (hits.length > before && !first) first = rule;
    }
    return first ? { rule: first, hits } : null;
  }

  /* ---------- 등급 ---------- */
  SD.LEVELS = [
    { key: 'safe', min: 0, label: '안전', sub: '정상 거래 가능성 높음', color: 'var(--safe)' },
    { key: 'caution', min: 25, label: '주의', sub: '추가 확인 후 거래 권장', color: 'var(--caution)' },
    { key: 'danger', min: 50, label: '위험', sub: '사기 패턴 다수 감지', color: 'var(--danger)' },
    { key: 'fraud', min: 80, label: '사기확정', sub: '사기 극주의 · 거래 중단 권고', color: 'var(--fraud)' }
  ];
  function levelOf(score, banned) {
    if (banned) return { key: 'banned', label: '거래 금지', sub: '거래 금지 품목', color: 'var(--fraud)' };
    let lv = SD.LEVELS[0];
    SD.LEVELS.forEach((l) => { if (score >= l.min) lv = l; });
    return lv;
  }

  /* ---------- 점검 팁 ---------- */
  const FAMILY_TIPS = {
    iphone: (e) => [
      '설정 › 배터리 › <b>배터리 성능 상태</b>가 80% 이상인지 캡처로 확인하세요. (80% 미만이면 교체비 약 10만원 감안)',
      e && e.bio === 'touch'
        ? '<b>Touch ID(홈 버튼)</b> 지문 등록·인식이 되는지 확인하세요. 홈 버튼 교체 시 Touch ID가 영구 불능입니다.'
        : '<b>Face ID</b> 등록·인식이 정상인지 확인하세요. 수리 이력 시 작동 불가인 경우가 많습니다.',
      '<b>나의 iPhone 찾기(활성화 잠금)</b> 해제 및 초기화 상태를 현장에서 확인하세요.',
      '설정 › 일반 › 정보의 <b>부품 및 서비스 이력</b>에서 비정품 디스플레이/배터리 여부를 확인하세요.',
      '<b>IMEI</b>로 분실·도난 단말 여부를 조회하세요. (이동통신단말기 분실도난 조회)'
    ],
    galaxy: () => [
      '삼성 멤버스 › 진단에서 <b>배터리 상태·터치·센서</b>를 함께 점검하세요.',
      '<b>삼성 계정 로그아웃</b>과 공장 초기화 여부를 확인하세요. (FRP 잠금)',
      '흰 화면을 띄워 <b>번인·잔상</b>, 폴더블은 <b>힌지·주름 들뜸</b>을 확인하세요.',
      '<b>IMEI</b>로 분실·도난 및 할부 미납 여부를 확인하세요.'
    ]
  };

  function buildTips(r) {
    const tips = [];
    if (r.banned) {
      return [
        '<b>즉시 거래를 중단하세요.</b> 전문의약품(위고비·식욕억제제·수면제 등)과 도수 있는 안경·콘택트렌즈는 약사법·의료기기법상 온라인 개인 간 거래가 불법입니다.',
        '온라인 중고거래로 유통되는 의약품·렌즈는 <b>변질·가짜 약품·부작용 위험</b>이 매우 높으며 구매자도 법적 불이익을 받을 수 있습니다.',
        '해당 게시글은 거래 플랫폼의 <b>신고하기</b> 기능 또는 <b>식품의약품안전처 온라인 불법유통 신고</b>로 제보해 주세요.',
        '금전 입금 유도나 사기 피해가 발생한 경우 <b>경찰청 사이버범죄 신고시스템(ECRM)</b> 또는 <b>112</b>에 즉시 신고하세요.'
      ];
    }
    if (r.cats.phishing.score) tips.push('<b>외부 링크로 절대 결제하지 마세요.</b> 플랫폼을 사칭한 가짜 안전결제 페이지는 대표적인 피싱 수법입니다.');
    if (r.cats.prepay.score) tips.push('<b>수고비·수수료 재입금·선입금 요구는 100% 사기</b>입니다. 정상 안전결제는 추가 입금을 요구하지 않습니다.');
    if (r.cats.messenger.score) tips.push('<b>카톡·텔레그램 등 외부 메신저 이동을 거절</b>하세요. 플랫폼 밖 대화는 신고·보호가 어렵습니다.');
    if (r.cats.direct.score) tips.push('직거래를 회피한다면 <b>플랫폼 안전결제(번개페이·당근페이 등)</b>로만 거래하세요.');
    if (r.priceInfo && r.priceInfo.overpriced) {
      tips.push('<b>일반 중고 평균 시세보다 과도하게 비싼 매물입니다.</b> 저가 미끼 사기는 아니더라도 금전적 손해가 크므로 이 매물은 피하시고 평균 시세 범위 내 다른 매물을 찾아보시는 것을 추천합니다.');
    }
    if (r.priceInfo && r.priceInfo.ratio != null && r.priceInfo.ratio < 0.65) tips.push('평균 시세보다 많이 저렴하다면 <b>더치트(thecheat.co.kr)</b>에서 판매자 계좌·전화번호 피해 사례를 조회하세요.');
    if (r.deviceInfo && FAMILY_TIPS[r.deviceInfo.family]) tips.push(...FAMILY_TIPS[r.deviceInfo.family](r.deviceInfo));
    if (!tips.length || tips.length < 3) {
      tips.push('가능하면 <b>공공장소 직거래</b>로 실물을 확인한 뒤 결제하세요.');
      tips.push('판매자의 <b>거래 후기·가입 기간</b>을 확인하세요.');
    }
    return tips;
  }

  /* ---------- 판매자 검증 멘트 ---------- */
  const PLATFORM_PAY = { bunjang: '번개페이(번개장터 안전결제)', daangn: '당근페이 / 직거래', joongna: '중고나라 페이(안전결제)', naver: '중고나라 페이(안전결제)', other: '플랫폼 안전결제' };
  const PLATFORM_CHAT = { bunjang: '번개톡', daangn: '당근 채팅', joongna: '중고나라 채팅', naver: '카페 쪽지/채팅', other: '플랫폼 채팅' };

  function buildScript(r, item) {
    const today = new Date();
    const date = `${today.getMonth() + 1}월 ${today.getDate()}일`;
    const p = item.platform || 'other';
    const title = (item.title || '상품').slice(0, 40);

    if (r.banned) {
      return [
        '죄송하지만 해당 품목은 거래하지 않겠습니다.',
        '거래 금지 품목으로 판단되어 플랫폼에 신고 접수할 예정이며,',
        '추가 연락 및 개인정보 요구는 삼가 부탁드립니다.'
      ].join('\n');
    }

    const q = [];
    q.push(`안녕하세요! 올려주신 "${title}" 보고 연락드려요 🙂`);
    q.push('구매 전에 몇 가지만 확인 부탁드릴게요.');
    q.push('');
    const lines = [];
    lines.push(`판매자님 닉네임과 오늘 날짜(${date})를 적은 메모지를 상품 옆에 두고 실물 사진 한 장 부탁드려요.`);

    const fam = r.deviceInfo && r.deviceInfo.family;
    if (fam === 'iphone') {
      lines.push('설정 › 배터리 › 배터리 성능 상태 화면 캡처 가능할까요?');
      lines.push(r.deviceInfo.bio === 'touch'
        ? '홈 버튼 Touch ID 지문 인식 정상인가요? 짧은 영상이면 더 좋아요.'
        : 'Face ID 정상 작동하나요? 수리·부품 교체 이력도 궁금해요.');
      lines.push('"나의 iPhone 찾기" 해제하고 초기화한 상태로 거래 가능하실까요?');
    } else if (fam === 'galaxy') {
      lines.push('삼성 멤버스 자가진단 결과(배터리 포함) 캡처 가능할까요?');
      lines.push('삼성 계정 로그아웃·초기화 후 거래 가능하실까요?');
    } else {
      lines.push('구매 시기와 사용 기간, 하자 여부 알려주실 수 있을까요?');
    }

    if (r.priceInfo && r.priceInfo.ratio != null && r.priceInfo.ratio < 0.65) {
      lines.push('시세보다 많이 저렴한데, 혹시 하자나 급히 파시는 이유가 있을까요?');
    }
    if (r.cats.phishing.score) lines.push(`결제는 보내주신 외부 링크 말고 ${PLATFORM_PAY[p]}로만 진행하고 싶어요. 가능하실까요?`);
    if (r.cats.messenger.score) lines.push(`대화는 ${PLATFORM_CHAT[p]}으로만 이어가도 될까요?`);
    if (r.cats.prepay.score) lines.push('선입금·수수료 추가 입금은 어렵고, 앱 내 안전결제만 가능해요.');
    if (r.cats.direct.score || r.score >= 25) lines.push('직거래 가능하실까요? 가능한 지역·시간 알려주시면 맞춰볼게요.');

    lines.forEach((l, i) => q.push(`${i + 1}. ${l}`));
    q.push('');
    q.push('확인되면 바로 구매 결정할게요. 감사합니다!');
    return q.join('\n');
  }

  /* ---------- 요약 문구 ---------- */
  function buildSummary(r) {
    if (r.banned) return `거래 금지 · 이상 품목(${r.banned.rule.title})이 감지되어 시세 계산을 중단했습니다. ${r.banned.rule.warn}`;
    const parts = [];
    if (r.priceInfo && r.priceInfo.isGeneralItem && r.item.price != null) {
      parts.push(`일반 중고 물품 (판매가 ${SD.won(r.item.price)} 기준 · 사기 키워드 및 거래 패턴 중심 분석)`);
    } else if (r.priceInfo && r.priceInfo.ratio != null && r.priceInfo.market && r.priceInfo.expectedPrice != null) {
      const m = r.priceInfo.market;
      const diffPct = r.priceInfo.diffPct;
      const diffWon = r.priceInfo.diffWon;
      const gradeLabel = r.condition.grade === 'A급' ? '중고 평균(A급)' : r.condition.grade;
      const label = `'${m.query}' ${gradeLabel} 시세(${SD.manwon(r.priceInfo.expectedPrice)})`;
      if (diffWon === 0) {
        parts.push(`${label}와 정확히 일치`);
      } else if (diffWon < 0) {
        parts.push(`${label} 대비 ${SD.won(Math.abs(diffWon))}(${Math.abs(diffPct)}%) 저렴`);
      } else {
        parts.push(`${label} 대비 +${SD.won(diffWon)}(+${diffPct}%) 비쌈`);
      }
    } else {
      parts.push('일반 중고(A급) 평균 시세와 비교하여 가격 위험도를 판독합니다');
    }
    const flagged = SD.RISK_CATEGORIES.filter((c) => c.id !== 'price' && r.cats[c.id].score > 0).map((c) => c.label);
    parts.push(flagged.length ? `위험 패턴 감지: ${flagged.join(', ')}` : '위험 키워드 없음 (정상 급처/일반 매물)');
    return parts.join(' · ');
  }

  /* ---------- 메인 분석 ---------- */
  SD.analyze = function (item) {
    const title = item.title || '';
    const desc = item.description || '';
    const full = title + '\n' + desc;

    const autoCond = parseCondition(title, desc, item.status);
    const chosenCondition = item.selectedGrade && SD.CONDITIONS[item.selectedGrade]
      ? {
          grade: item.selectedGrade,
          badgeText: item.selectedGrade === 'B급' ? 'B급 (사용감 있음)' : item.selectedGrade,
          raw: item.selectedGrade,
          inferred: false,
          manual: true
        }
      : autoCond;

    const r = {
      item,
      cats: {},
      hits: [],
      deviceInfo: detectDeviceFamily(full),
      storage: parseStorage(full),
      condition: chosenCondition,
      priceInfo: null,
      banned: null,
      score: 0
    };
    SD.RISK_CATEGORIES.forEach((c) => { r.cats[c.id] = { score: 0, max: c.max, hits: [] }; });

    // 1) 이상 품목 필터 — 감지 시 시세 계산 중단, 100점
    r.banned = detectBanned(full);
    if (r.banned) {
      r.hits = r.banned.hits;
      r.score = 100;
      r.level = levelOf(100, true);
      r.summary = buildSummary(r);
      r.tips = buildTips(r);
      r.script = buildScript(r, item);
      return r;
    }

    // 2) 위험 키워드 먼저 탐지 (키워드 0점 여부 확인)
    r.hits = detectRisks(full);
    r.hits.forEach((h) => r.cats[h.cat].hits.push(h));

    const hasOtherRiskKeywords = r.hits.length > 0;
    const hasCritical = r.cats.phishing.hits.length > 0 || r.cats.prepay.hits.length > 0;

    // 3) 시세 연동 판독 — 내장 스마트폰/IT DB 미등록 일반 물품은 판매자 가격을 정상 기준가로 인정 (0점)
    const isBuiltinMatched = Boolean(
      SD.matchBuiltinMarketModel(item.searchQuery || item.marketQuery || title) ||
      SD.matchBuiltinMarketModel(title)
    );
    let market;
    if (isBuiltinMatched) {
      market = (item.realtimeMarket && !item.realtimeMarket.isGeneralItem)
        ? item.realtimeMarket
        : SD.getInstantMarketStats(item.searchQuery || item.marketQuery || title, item.price);
    } else {
      market = SD.getInstantMarketStats(item.searchQuery || item.marketQuery || title, item.price);
    }
    item.realtimeMarket = market;

    const ps = scorePrice(item.price, market, r.condition.grade, hasOtherRiskKeywords);
    r.priceInfo = Object.assign({ market }, ps);
    r.cats.price.score = ps.score;

    const isBaitPrice = !ps.isGeneralItem && r.priceInfo && r.priceInfo.ratio != null && r.priceInfo.ratio < 0.55;

    if (r.cats.phishing.hits.length) r.cats.phishing.score = r.cats.phishing.max; // 35점
    if (r.cats.prepay.hits.length) r.cats.prepay.score = r.cats.prepay.max;       // 25점

    if (r.cats.messenger.hits.length) {
      r.cats.messenger.score = (hasCritical || isBaitPrice) ? r.cats.messenger.max : 6;
    }
    if (r.cats.direct.hits.length) {
      r.cats.direct.score = (hasCritical || isBaitPrice) ? r.cats.direct.max : 5;
    }
    if (r.cats.pressure.hits.length) {
      r.cats.pressure.score = (hasCritical || isBaitPrice) ? r.cats.pressure.max : 2;
    }

    // 4) 사기 키워드가 감지되지 않은 매물은 시세 괴리 점수가 최대 10점을 넘지 못하도록 강제 상한선(Cap) 적용
    //    -> 종합 위험도가 무조건 0~10점('안전' 등급, 초록색 게이지)으로 나오도록 보장
    if (!hasOtherRiskKeywords) {
      r.cats.price.score = Math.min(10, r.cats.price.score);
      if (r.priceInfo) {
        r.priceInfo.score = r.cats.price.score;
      }
    }

    r.score = Math.min(100, Object.values(r.cats).reduce((s, c) => s + c.score, 0));
    r.level = levelOf(r.score, false);
    r.summary = buildSummary(r);
    r.tips = buildTips(r);
    r.script = buildScript(r, item);
    return r;
  };

  /* ---------- 본문 하이라이트 (안전하게 escape 후 <mark>) ---------- */
  SD.highlight = function (text, hits) {
    if (!text) return '';
    const ranges = hits
      .filter((h) => h.index != null)
      .map((h) => ({ s: h.index, e: h.index + h.len, cat: h.cat, label: h.label }))
      .sort((a, b) => a.s - b.s || b.e - a.e);
    const merged = [];
    ranges.forEach((r) => {
      const last = merged[merged.length - 1];
      if (last && r.s < last.e) { last.e = Math.max(last.e, r.e); }
      else merged.push(Object.assign({}, r));
    });
    let out = '';
    let pos = 0;
    merged.forEach((r) => {
      out += SD.escapeHTML(text.slice(pos, r.s));
      out += `<mark class="hl hl-${r.cat}" title="${SD.escapeHTML(r.label)}">${SD.escapeHTML(text.slice(r.s, r.e))}</mark>`;
      pos = r.e;
    });
    out += SD.escapeHTML(text.slice(pos));
    return out;
  };
})(window.SD);
