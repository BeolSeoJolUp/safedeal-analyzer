/* ==========================================================================
   SafeDeal URL Analyzer — fetcher.js
   URL → 상품 정보 자동 추출 (백엔드 없이 브라우저에서 직접 호출)
   ① 번개장터 공개 API JSON 추출 (Direct → AllOrigins Raw → AllOrigins JSON → CodeTabs → CorsProxy, 타임아웃 각 8초)
   ② 타 플랫폼(당근·중고나라 등) Microlink & OpenGraph HTML 파싱
   ========================================================================== */
(function (SD) {
  'use strict';

  const PROXY_ALLORIGINS_RAW = 'https://api.allorigins.win/raw?url=';
  const PROXY_ALLORIGINS_GET = 'https://api.allorigins.win/get?url=';
  const PROXY_CODETABS = 'https://api.codetabs.com/v1/proxy?quest=';
  const PROXY_CORSPROXY = 'https://corsproxy.io/?';
  const MICROLINK = 'https://api.microlink.io/?url=';

  /* ---------- 1. 번개장터 · 중고나라 상품 번호(PID) 정규식 추출 ---------- */
  function extractBunjangPid(str) {
    if (!str) return null;
    const s = String(str);
    const patterns = [
      /\/products\/(\d+)/i,
      /\/product\/(\d+)/i,
      /[?&](?:pid|product_id|item_id|id)=(\d+)/i,
      /\b(\d{7,12})\b/
    ];
    for (const re of patterns) {
      const m = s.match(re);
      if (m && m[1]) return m[1];
    }
    return null;
  }
  SD.extractBunjangPid = extractBunjangPid;

  function extractJoongnaPid(str) {
    if (!str) return null;
    const s = String(str);
    const patterns = [
      /\/product\/(?:detail\/)?(\d+)/i,
      /\/products\/(\d+)/i,
      /[?&](?:productSeq|seq|pid|product_id|id)=(\d+)/i,
      /\b(\d{6,12})\b/
    ];
    for (const re of patterns) {
      const m = s.match(re);
      if (m && m[1]) return m[1];
    }
    return null;
  }
  SD.extractJoongnaPid = extractJoongnaPid;

  /* ---------- 플랫폼 판별 ---------- */
  SD.detectPlatform = function (url) {
    let u;
    try { u = new URL(url); } catch (e) { return null; }
    const host = u.hostname.toLowerCase();
    if (
      host.includes('bunjang') ||
      host.endsWith('bgzt.link') ||
      host.endsWith('globalbunjang.com')
    ) {
      const pid = extractBunjangPid(url);
      return { id: 'bunjang', name: '번개장터', pid, shortLink: !pid };
    }
    if (host.endsWith('daangn.com') || host.endsWith('karrotmarket.com') || host.includes('karrot')) {
      return { id: 'daangn', name: '당근마켓' };
    }
    if (host.endsWith('joongna.com') || host.includes('joongna')) {
      const pid = extractJoongnaPid(url);
      return { id: 'joongna', name: '중고나라', pid };
    }
    if (host === 'cafe.naver.com' || host === 'm.cafe.naver.com' || host === 'naver.me') {
      return { id: 'naver', name: '네이버 카페', restricted: true };
    }
    const maybePid = /\/products\/(\d{7,12})/i.exec(url);
    if (maybePid) {
      return { id: 'bunjang', name: '번개장터', pid: maybePid[1], shortLink: false };
    }
    return { id: 'other', name: host.replace(/^www\./, '') };
  };

  /** 사용자가 붙여넣은 문자열을 URL로 정규화 (스킴 누락 보정). URL이 아니면 null */
  SD.normalizeUrl = function (s) {
    s = (s || '').trim();
    if (!s) return null;
    if (s.includes('\n') || s.length > 320) return null;
    const found = s.match(/https?:\/\/[^\s<>"']+/i);
    if (found && s.length < found[0].length + 40) s = found[0];
    else if (/^(?:m\.|www\.|web\.)?(?:bunjang\.co\.kr|bunjang\.kr|globalbunjang\.com|bgzt\.link|daangn\.com|joongna\.com|cafe\.naver\.com|naver\.me)\/\S+/i.test(s)) {
      s = 'https://' + s;
    } else if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(s)) {
      s = 'https://' + s;
    } else {
      return null;
    }
    try { return new URL(s).href; } catch (e) { return null; }
  };

  /* ---------- 공통 fetch (타임아웃 기본 8000ms) ---------- */
  async function fetchJsonWithTimeout(url, ms = 8000, unwrapContents = false) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { Accept: 'application/json, text/plain, */*' },
        cache: 'no-store'
      });
      if (!res.ok) {
        const err = new Error('HTTP ' + res.status);
        err.status = res.status;
        throw err;
      }
      const txt = await res.text();
      if (!txt) throw new Error('빈 응답');
      let parsed;
      try {
        parsed = JSON.parse(txt);
      } catch (e) {
        const trimmed = txt.trim();
        const start = trimmed.indexOf('{');
        const end = trimmed.lastIndexOf('}');
        if (start !== -1 && end > start) {
          parsed = JSON.parse(trimmed.slice(start, end + 1));
        } else {
          throw new Error('JSON 파싱 불가');
        }
      }
      if (unwrapContents && parsed && typeof parsed.contents === 'string') {
        parsed = JSON.parse(parsed.contents);
      }
      return parsed;
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchTextWithTimeout(url, ms = 8000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }

  function stripHTML(s) {
    if (!s) return '';
    const doc = new DOMParser().parseFromString('<body>' + String(s).replace(/<br\s*\/?>/gi, '\n') + '</body>', 'text/html');
    const txt = (doc.body.textContent || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
    // 번개장터 SPA 기본 껍데기 문구 필터링
    if (/^직거래부터\s*택배거래까지\s*쉽고\s*안전하게/i.test(txt)) return '';
    return txt;
  }

  function cleanTitle(t) {
    if (!t) return '';
    t = stripHTML(t)
      .replace(/^\s*(?:번개장터|당근마켓|당근|중고나라)\s*[|:\-–·]\s*/i, '')
      .replace(/\s*[|\-–·:]\s*(?:번개장터|당근\s*마켓|당근|중고나라|네이버\s*카페|daangn|bunjang|joongna)[^|]*$/i, '')
      .trim();
    if (/^(?:번개장터|당근\s*마켓|당근|중고나라|네이버\s*카페|naver|로그인|login|error|access denied)(?![가-힣a-z0-9])/i.test(t) && t.length < 25) return '';
    if (/직거래부터\s*택배거래까지/i.test(t)) return '';
    return t;
  }

  function absUrl(u, base) {
    if (!u) return '';
    try { return new URL(u, base).href; } catch (e) { return ''; }
  }

  function toNumericPrice(val) {
    if (val == null || val === '') return null;
    if (typeof val === 'number' && Number.isFinite(val) && val > 0) return Math.round(val);
    const cleaned = Number(String(val).replace(/[^\d]/g, ''));
    if (Number.isFinite(cleaned) && cleaned >= 500 && cleaned <= 100000000) return cleaned;
    return SD.normalizePrice(val);
  }

  /* ---------- 2. 번개장터 API JSON 응답 구조 파서 ---------- */
  const BUNJANG_CONDITION_MAP = {
    1: 'B급',
    2: '미개봉',
    3: 'A급',
    4: 'S급',
    5: 'C급',
    NEW: '미개봉',
    UNOPENED: '미개봉',
    UNUSED: '미개봉',
    LIKE_NEW: 'S급',
    MINT: 'S급',
    BEST: 'S급',
    LIGHTLY_USED: 'A급',
    GOOD: 'A급',
    USED_GOOD: 'A급',
    USED: 'A급',
    HEAVILY_USED: 'B급',
    FAIR: 'B급',
    NORMAL: 'B급',
    POOR: 'C급',
    BROKEN: 'C급',
    DAMAGED: 'C급'
  };

  function resolveBunjangImage(rawImg) {
    if (!rawImg) return '';
    let img = rawImg;
    if (Array.isArray(img)) {
      img = img[0] && (img[0].imageUrl || img[0].url || img[0]);
    } else if (typeof img === 'object') {
      img = img.imageUrl || img.url || img.image_url || '';
    }
    if (typeof img !== 'string') return '';
    img = img.replace(/\{cnt\}/g, '1').replace(/\{res\}/g, '600');
    if (img.startsWith('//')) img = 'https:' + img;
    return img;
  }

  function fromBunjangJSON(j) {
    if (!j) return null;
    if (typeof j.contents === 'string') {
      try { j = JSON.parse(j.contents); } catch (e) { return null; }
    }

    // [케이스 A] PMS API 응답 (data.product.{name, price, description, imageUrl, condition})
    if (j.data && j.data.product) {
      const p = j.data.product;
      const title = String(p.name || p.title || '').trim();
      const price = toNumericPrice(p.price != null ? p.price : (p.salePrice || p.originPrice));
      const descRaw = String(p.description || p.descriptionText || p.content || '').trim();
      const rawCond = p.condition || p.status || '';
      const statusGrade = BUNJANG_CONDITION_MAP[String(rawCond).toUpperCase()] || BUNJANG_CONDITION_MAP[rawCond] || '';
      const image = resolveBunjangImage(p.imageUrl || p.images || p.image || p.thumbnailUrl);
      const sellerName =
        (j.data.shop && (j.data.shop.name || j.data.shop.shopName)) ||
        (p.seller && (p.seller.name || p.seller.nickName)) ||
        '';

      if (title && price != null) {
        return {
          title,
          price,
          officialPrice: true,
          description: descRaw + (statusGrade && !descRaw.includes(statusGrade) ? `\n[플랫폼 등록 상태: ${statusGrade}]` : ''),
          status: statusGrade || null,
          image,
          seller: sellerName ? `번개장터 상점 · ${sellerName}` : ''
        };
      }
    }

    // [케이스 B] 구형 v1 API 응답 (item_info.{name, price, description_for_detail, image_url})
    const it =
      j.item_info ||
      (j.data && (j.data.item || j.data)) ||
      j.product ||
      (j.name && j.price != null ? j : null);

    if (!it) return null;

    const title = String(it.name || it.title || '').trim();
    const price = toNumericPrice(it.price);
    const descRaw = String(it.description_for_detail || it.description || it.descriptionText || it.desc || it.content || '').trim();
    const rawCond = it.condition || it.status || '';
    const statusGrade = BUNJANG_CONDITION_MAP[String(rawCond).toUpperCase()] || BUNJANG_CONDITION_MAP[rawCond] || '';
    const image = resolveBunjangImage(it.image_url || it.product_image || it.imageUrl || it.image || it.images);
    const sellerName =
      (j.seller_info && (j.seller_info.shop_name || j.seller_info.name)) ||
      (it.seller && (it.seller.name || it.seller.nickName)) ||
      it.uid ||
      '';

    if (!title || price == null) return null;

    return {
      title,
      price,
      officialPrice: true,
      description: descRaw + (statusGrade && !descRaw.includes(statusGrade) ? `\n[플랫폼 등록 상태: ${statusGrade}]` : ''),
      status: statusGrade || null,
      image,
      seller: sellerName ? `번개장터 상점 · ${sellerName}` : ''
    };
  }

  /* 번개장터 축약 링크(bunjang.kr, bgzt.link 등)에서 PID 추적 */
  async function resolveBunjangShortUrl(rawUrl) {
    const directPid = extractBunjangPid(rawUrl);
    if (directPid) return directPid;
    const tries = [
      () => fetchTextWithTimeout(PROXY_ALLORIGINS_RAW + encodeURIComponent(rawUrl), 8000).then((html) => extractBunjangPid(html)),
      () => fetchJsonWithTimeout(PROXY_ALLORIGINS_GET + encodeURIComponent(rawUrl), 8000, false).then((j) => extractBunjangPid(j && j.contents)),
      () => fetchTextWithTimeout(PROXY_CODETABS + encodeURIComponent(rawUrl), 8000).then((html) => extractBunjangPid(html)),
      () => fetchTextWithTimeout(PROXY_CORSPROXY + encodeURIComponent(rawUrl), 8000).then((html) => extractBunjangPid(html))
    ];
    for (const fn of tries) {
      try {
        const pid = await fn();
        if (pid) return pid;
      } catch (e) { /* 다음 프록시로 진행 */ }
    }
    return null;
  }

  /* ---------- 번개장터 API × 5단계 프록시 순차 호출 (타임아웃 각 8초) ----------
   * ① 직접 호출: fetch(apiUrl)
   * ② AllOrigins Raw: fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(apiUrl))
   * ③ AllOrigins JSON: fetch('https://api.allorigins.win/get?url=' + encodeURIComponent(apiUrl)) -> JSON.parse(res.contents)
   * ④ CodeTabs Proxy: fetch('https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(apiUrl))
   * ⑤ CorsProxy 정확 문법: fetch('https://corsproxy.io/?' + encodeURIComponent(apiUrl))
   */
  async function stepBunjangForcedAPI(pid, onProgress) {
    const encodedPid = encodeURIComponent(pid);
    const targetApis = [
      {
        ver: 'PMS v3 API',
        url: `https://api.bunjang.co.kr/api/pms/v3/products-detail/${encodedPid}?viewerUid=-1`
      },
      {
        ver: 'PMS v2 API',
        url: `https://api.bunjang.co.kr/api/pms/v2/products-detail/${encodedPid}?viewerUid=-1`
      },
      {
        ver: 'v1 구형 API',
        url: `https://api.bunjang.co.kr/api/1/product/${encodedPid}/detail_info.json`
      }
    ];

    const proxyTransports = [
      {
        name: '① 직접 호출',
        call: (apiUrl) => fetchJsonWithTimeout(apiUrl, 8000, false)
      },
      {
        name: '② AllOrigins Raw',
        call: (apiUrl) => fetchJsonWithTimeout('https://api.allorigins.win/raw?url=' + encodeURIComponent(apiUrl), 8000, false)
      },
      {
        name: '③ AllOrigins JSON',
        call: (apiUrl) => fetchJsonWithTimeout('https://api.allorigins.win/get?url=' + encodeURIComponent(apiUrl), 8000, true)
      },
      {
        name: '④ CodeTabs Proxy',
        call: (apiUrl) => fetchJsonWithTimeout('https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(apiUrl), 8000, false)
      },
      {
        name: '⑤ CorsProxy',
        call: (apiUrl) => fetchJsonWithTimeout('https://corsproxy.io/?' + encodeURIComponent(apiUrl), 8000, false)
      }
    ];

    for (const api of targetApis) {
      for (const transport of proxyTransports) {
        const stepLabel = `${api.ver} · ${transport.name}`;
        if (onProgress) onProgress(stepLabel);
        try {
          const json = await transport.call(api.url);
          const parsed = fromBunjangJSON(json);
          if (parsed && parsed.title && parsed.price != null) {
            return { data: parsed, via: stepLabel };
          }
          // 만약 JSON 응답 자체가 status: 404 (존재하지 않는 API 버전)이면 다음 API 버전으로 이동
          if (json && (json.status === 404 || json.error === 'Not Found')) {
            break;
          }
        } catch (e) {
          // 직접 호출에서 HTTP 404가 명확히 확인된 경우에는 해당 API 버전이 구버전이므로 다음 API 버전으로 즉시 이동
          if (e && e.status === 404 && transport.name === '① 직접 호출') {
            break;
          }
        }
      }
    }
    throw new Error('번개장터 API 응답을 가져오지 못했습니다');
  }

  /* ---------- 3. 중고나라 웹(__NEXT_DATA__ & OpenGraph) · 타 플랫폼 파싱 ---------- */
  const JOONGNA_CONDITION_MAP = {
    0: 'A급',
    1: '미개봉',
    NEW: '미개봉',
    UNOPENED: '미개봉',
    UNUSED: '미개봉',
    MI_GAE_BONG: '미개봉',
    MINT: 'S급',
    LIKE_NEW: 'S급',
    S: 'S급',
    A: 'A급',
    GOOD: 'A급',
    USED: 'A급',
    B: 'B급',
    FAIR: 'B급',
    HEAVILY_USED: 'B급',
    C: 'B급'
  };

  function resolveGenericImage(rawImg, baseUrl) {
    if (!rawImg) return '';
    let img = rawImg;
    if (Array.isArray(img)) {
      for (const entry of img) {
        const resolved = resolveGenericImage(entry, baseUrl);
        if (resolved) return resolved;
      }
      return '';
    }
    if (typeof img === 'object') {
      img =
        img.originUrl ||
        img.imageUrl ||
        img.url ||
        img.thumbnailUrl ||
        img.mediaUrl ||
        img.image_url ||
        img.src ||
        '';
    }
    if (typeof img !== 'string') return '';
    img = img.trim();
    if (!img) return '';
    if (img.startsWith('//')) img = 'https:' + img;
    return absUrl(img, baseUrl);
  }

  /* ① <script id="__NEXT_DATA__" type="application/json"> 최우선 파서 (중고나라 웹 등 Next.js 기반) */
  function parseNextDataHTML(html, baseUrl, doc) {
    if (!html) return null;
    let rawJson = '';
    if (doc) {
      const scriptEl = doc.querySelector('script#__NEXT_DATA__');
      if (scriptEl && scriptEl.textContent) rawJson = scriptEl.textContent.trim();
    }
    if (!rawJson) {
      const m = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
      if (m && m[1]) rawJson = m[1].trim();
    }
    if (!rawJson) return null;

    const targetPid = extractJoongnaPid(baseUrl);
    let bestTitle = '';
    let bestPrice = null;
    let bestDesc = '';
    let bestImg = '';
    let bestSeller = '';
    let bestStatus = '';

    try {
      const parsed = JSON.parse(rawJson);
      const root = (parsed && parsed.props && parsed.props.pageProps) ? parsed.props.pageProps : parsed;
      const candidates = [];

      const visit = (node, depth) => {
        if (!node || typeof node !== 'object' || depth > 14) return;
        if (Array.isArray(node)) {
          for (let i = 0; i < Math.min(node.length, 60); i++) visit(node[i], depth + 1);
          return;
        }

        const rawTitle =
          node.productTitle ||
          node.articleTitle ||
          node.productName ||
          node.subject ||
          (typeof node.title === 'string' ? node.title : '') ||
          (typeof node.name === 'string' && (node.price != null || node.productPrice != null || node.salePrice != null || node.productDescription != null || node.content != null) ? node.name : '');

        const rawPrice =
          node.productPrice != null ? node.productPrice :
          node.salePrice != null ? node.salePrice :
          node.sellPrice != null ? node.sellPrice :
          node.price != null && typeof node.price !== 'object' ? node.price :
          (node.price && typeof node.price === 'object' && node.price.amount != null ? node.price.amount : null);

        const rawDesc =
          node.productDescription ||
          node.articleContent ||
          node.productContent ||
          node.detailContent ||
          (typeof node.content === 'string' ? node.content : '') ||
          (typeof node.description === 'string' ? node.description : '');

        const rawMedia =
          node.media ||
          node.images ||
          node.productImages ||
          node.imageUrls ||
          node.imageList ||
          node.representativeImageUrl ||
          node.mainImageUrl ||
          node.imageUrl ||
          node.thumbnailUrl ||
          node.image ||
          node.thumbnail;

        const rawSeller =
          node.nickName ||
          node.nickname ||
          node.sellerName ||
          node.storeName ||
          node.memberNickName ||
          node.writerName ||
          (node.seller && (node.seller.nickName || node.seller.nickname || node.seller.name)) ||
          (node.store && (node.store.storeName || node.store.name)) ||
          '';

        const rawCond =
          node.productStatus != null ? node.productStatus :
          node.productCondition != null ? node.productCondition :
          node.usedType != null ? node.usedType :
          node.condition != null ? node.condition : '';

        const cleanedT = cleanTitle(rawTitle);
        const numericP = toNumericPrice(rawPrice);
        const cleanedD = stripHTML(rawDesc);
        const resolvedImg = resolveGenericImage(rawMedia, baseUrl);
        const nodeSeq = String(node.productSeq || node.seq || node.articleSeq || node.id || '');

        if (cleanedT || numericP != null || cleanedD.length > 10 || resolvedImg) {
          let score = 0;
          if (node.productTitle || node.productPrice != null || node.productDescription) score += 60;
          if (targetPid && nodeSeq === String(targetPid)) score += 80;
          if (cleanedT) score += 25;
          if (numericP != null) score += 30;
          if (cleanedD && cleanedD.length > 10) score += 25;
          if (resolvedImg) score += 15;

          candidates.push({
            score,
            title: cleanedT,
            price: numericP,
            description: cleanedD,
            image: resolvedImg,
            seller: typeof rawSeller === 'string' ? rawSeller.trim() : '',
            status: JOONGNA_CONDITION_MAP[String(rawCond).toUpperCase()] || JOONGNA_CONDITION_MAP[rawCond] || ''
          });
        }

        for (const k of Object.keys(node)) {
          if (k === 'recommendProducts' || k === 'relatedProducts' || k === 'similarProducts' || k === 'otherProducts' || k === 'popularProducts') continue;
          visit(node[k], depth + 1);
        }
      };

      visit(root, 0);
      candidates.sort((a, b) => b.score - a.score);

      for (const c of candidates) {
        if (!bestTitle && c.title) bestTitle = c.title;
        if (bestPrice == null && c.price != null) bestPrice = c.price;
        if (c.description && c.description.length > bestDesc.length) bestDesc = c.description;
        if (!bestImg && c.image) bestImg = c.image;
        if (!bestSeller && c.seller) bestSeller = c.seller;
        if (!bestStatus && c.status) bestStatus = c.status;
      }
    } catch (e) { /* JSON 파싱 실패 시 아래 정규식 폴백 실행 */ }

    // __NEXT_DATA__ 원문 정규식 폴백 (직렬화된 내부 문자열 대비)
    if (!bestTitle) {
      const tm = rawJson.match(/"(?:productTitle|articleTitle|productName|title)"\s*:\s*"((?:\\.|[^"\\]){2,160})"/);
      if (tm && tm[1]) {
        try { bestTitle = cleanTitle(JSON.parse(`"${tm[1]}"`)); } catch (e) { bestTitle = cleanTitle(tm[1]); }
      }
    }
    if (bestPrice == null) {
      const pm = rawJson.match(/"(?:productPrice|salePrice|sellPrice|price)"\s*:\s*(\d{3,10})\b/);
      if (pm && pm[1]) bestPrice = toNumericPrice(pm[1]);
    }
    if (!bestDesc) {
      const dm = rawJson.match(/"(?:productDescription|articleContent|productContent|content|description)"\s*:\s*"((?:\\.|[^"\\]){5,4000})"/);
      if (dm && dm[1]) {
        try { bestDesc = stripHTML(JSON.parse(`"${dm[1]}"`)); } catch (e) { bestDesc = stripHTML(dm[1]); }
      }
    }
    if (!bestImg) {
      const im = rawJson.match(/"(?:originUrl|imageUrl|thumbnailUrl|representativeImageUrl)"\s*:\s*"(https?:[^"\\]+|https?:\\\/\\\/[^"]+)"/);
      if (im && im[1]) {
        bestImg = im[1].replace(/\\\//g, '/');
      }
    }

    if (!bestTitle && bestPrice == null && !bestDesc && !bestImg) return null;

    return {
      title: bestTitle,
      price: bestPrice,
      officialPrice: bestPrice != null,
      description: bestDesc + (bestStatus && !bestDesc.includes(bestStatus) ? `\n[플랫폼 등록 상태: ${bestStatus}]` : ''),
      status: bestStatus || null,
      image: bestImg,
      seller: bestSeller ? `중고나라 판매자 · ${bestSeller}` : '',
      fromNextData: true
    };
  }

  /* OpenGraph 태그 및 메타 텍스트에서 제목과 가격을 정규식으로 정밀 추출 */
  function extractPriceFromMetaText(title, description, rawHtml) {
    const combined = `${title || ''}\n${description || ''}`;
    const explicitPatterns = [
      /(?:판매가|판매금액|가격|금액)\s*[:：·\-]?\s*([0-9]{1,3}(?:,[0-9]{3})+|\d{4,9})\s*원?/i,
      /([0-9]{1,3}(?:,[0-9]{3})+)\s*원/,
      /(\d{1,5}(?:\.\d+)?)\s*만\s*원/
    ];
    for (const re of explicitPatterns) {
      const m = combined.match(re);
      if (m && m[0]) {
        const p = SD.normalizePrice ? SD.normalizePrice(m[0]) : toNumericPrice(m[1]);
        if (p != null && p >= 500) return p;
      }
    }
    const parsed = SD.parsePrice ? SD.parsePrice(combined) : null;
    if (parsed != null) return parsed;

    if (rawHtml) {
      const jsonPriceMatch = rawHtml.match(/"(?:productPrice|salePrice|sellPrice|price)"\s*:\s*(\d{3,9})\b/);
      if (jsonPriceMatch && jsonPriceMatch[1]) {
        return toNumericPrice(jsonPriceMatch[1]);
      }
    }
    return null;
  }

  async function stepMicrolink(url, timeoutMs = 8000) {
    const j = await fetchJsonWithTimeout(MICROLINK + encodeURIComponent(url), timeoutMs, false);
    if (!j || j.status !== 'success' || !j.data) throw new Error((j && j.message) || '메타데이터 없음');
    const d = j.data;
    const metaPrice = toNumericPrice(d.price && (d.price.amount || d.price));
    const parsedPrice = metaPrice != null ? metaPrice : extractPriceFromMetaText(d.title || '', d.description || '', '');
    return {
      title: d.title || '',
      description: d.description || '',
      image: (d.image && (d.image.url || d.image)) || '',
      price: parsedPrice,
      officialPrice: metaPrice != null
    };
  }

  function regexMeta(html, propName) {
    if (!html) return '';
    const escaped = propName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i')
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m && m[1]) return stripHTML(m[1]);
    }
    return '';
  }

  function parseListingHTML(html, baseUrl) {
    if (!html) return { title: '', description: '', image: '', price: null, officialPrice: false };
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // ① 최우선: <script id="__NEXT_DATA__" type="application/json"> 파싱 (중고나라 웹 등)
    const nextData = parseNextDataHTML(html, baseUrl, doc);

    // ② 차순위 폴백/보완: <meta property="og:title">, <meta property="og:description">, <meta property="og:image"> 정규식 & DOM 추출
    const meta = (sel) => {
      const el = doc.querySelector(sel);
      return el ? (el.getAttribute('content') || '').trim() : '';
    };

    let ogTitle =
      meta('meta[property="og:title"]') ||
      regexMeta(html, 'og:title') ||
      meta('meta[name="twitter:title"]') ||
      regexMeta(html, 'twitter:title') ||
      (doc.title || '').trim();

    let ogDescription =
      meta('meta[property="og:description"]') ||
      regexMeta(html, 'og:description') ||
      meta('meta[name="description"]') ||
      regexMeta(html, 'description');

    let ogImage =
      meta('meta[property="og:image"]') ||
      regexMeta(html, 'og:image') ||
      meta('meta[name="twitter:image"]') ||
      regexMeta(html, 'twitter:image');

    let officialPrice = toNumericPrice(
      meta('meta[property="product:price:amount"]') ||
      regexMeta(html, 'product:price:amount') ||
      meta('meta[property="og:price:amount"]') ||
      regexMeta(html, 'og:price:amount') ||
      meta('meta[name="twitter:data1"]')
    );

    doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      try {
        const data = JSON.parse(s.textContent);
        const list = Array.isArray(data) ? data : (data['@graph'] || [data]);
        list.forEach((o) => {
          if (!o || ![].concat(o['@type'] || []).includes('Product')) return;
          if (o.name && !ogTitle) ogTitle = o.name;
          if (o.description && o.description.length > (ogDescription || '').length) ogDescription = o.description;
          const img = Array.isArray(o.image) ? o.image[0] : o.image;
          if (img && !ogImage) ogImage = typeof img === 'string' ? img : (img.url || ogImage);
          const off = Array.isArray(o.offers) ? o.offers[0] : o.offers;
          if (off && off.price != null) {
            const p = toNumericPrice(off.price);
            if (p != null) officialPrice = p;
          }
        });
      } catch (e) { /* 잘못된 JSON-LD 무시 */ }
    });

    // ① __NEXT_DATA__ 결과를 최우선 반영하고, 비어 있는 필드는 ② OpenGraph 태그로 보완
    const title = (nextData && nextData.title) ? nextData.title : ogTitle;
    const description = (nextData && nextData.description) ? nextData.description : ogDescription;
    const image = (nextData && nextData.image) ? nextData.image : absUrl(ogImage, baseUrl);
    const seller = (nextData && nextData.seller) ? nextData.seller : '';
    const status = (nextData && nextData.status) ? nextData.status : null;

    let price = (nextData && nextData.price != null) ? nextData.price : officialPrice;
    let isOfficialPrice = Boolean((nextData && nextData.price != null) || officialPrice != null);

    if (price == null) {
      const regexPrice = extractPriceFromMetaText(ogTitle || title, ogDescription || description, html);
      if (regexPrice != null) {
        price = regexPrice;
      }
    }

    const bodyText = doc.body ? doc.body.textContent.slice(0, 6000) : '';
    const loginWall = !price && !title && /로그인\s*(?:이\s*필요|후\s*이용|해\s*주세요)|회원만\s*(?:볼|이용)|멤버만|login\s*required/i.test(bodyText);

    return {
      title,
      description,
      image,
      price,
      officialPrice: isOfficialPrice,
      seller,
      status,
      fromNextData: Boolean(nextData && nextData.fromNextData),
      loginWall
    };
  }

  async function stepHTMLMultiProxy(url, onProgress) {
    const htmlFetchers = [
      {
        label: 'AllOrigins Raw HTML 파싱',
        fn: () => fetchTextWithTimeout(PROXY_ALLORIGINS_RAW + encodeURIComponent(url), 8000)
      },
      {
        label: 'AllOrigins JSON HTML 파싱',
        fn: async () => {
          const j = await fetchJsonWithTimeout(PROXY_ALLORIGINS_GET + encodeURIComponent(url), 8000, false);
          return j && j.contents;
        }
      },
      {
        label: 'CodeTabs HTML 파싱',
        fn: () => fetchTextWithTimeout(PROXY_CODETABS + encodeURIComponent(url), 8000)
      },
      {
        label: 'CorsProxy HTML 파싱',
        fn: () => fetchTextWithTimeout(PROXY_CORSPROXY + encodeURIComponent(url), 8000)
      }
    ];

    for (const item of htmlFetchers) {
      if (onProgress) onProgress(item.label);
      try {
        const html = await item.fn();
        if (html && html.length >= 120) {
          const parsed = parseListingHTML(html, url);
          if (parsed.title || parsed.price != null || parsed.loginWall) {
            parsed.via = item.label + (parsed.fromNextData ? ' (__NEXT_DATA__)' : ' (OpenGraph)');
            return parsed;
          }
        }
      } catch (e) { /* 다음 프록시로 진행 */ }
    }
    throw new Error('OpenGraph HTML 파싱 응답 지연');
  }

  /* ---------- 순차 파이프라인 ---------- */
  SD.fetchListing = async function (url, platform, onStep, onTitleProgress) {
    const out = {
      title: '',
      price: null,
      officialPrice: false,
      description: '',
      image: '',
      seller: '',
      sources: [],
      loginWall: false,
      naverMiniModal: false,
      pid: platform && platform.pid ? platform.pid : null
    };

    // 0. 네이버 카페(cafe.naver.com) URL은 네이버 로그인 보안 정책상 외부 추출이 불가하므로
    // 에러나 지연 없이 즉시 2칸 미니 입력 모달로 안내
    if (platform && platform.id === 'naver') {
      out.loginWall = true;
      out.naverMiniModal = true;
      onStep('bunjang', 'skip', '해당 없음');
      onStep('microlink', 'skip', '네이버 카페 로그인 보안 정책 · 미니 입력 모달 전환');
      onStep('allorigins', 'skip', '네이버 카페 로그인 보안 정책 · 미니 입력 모달 전환');
      return out;
    }

    const merge = (d, src) => {
      if (!d) return false;
      let used = false;
      const t = cleanTitle(d.title);
      if (!out.title && t) { out.title = t; used = true; }
      const numericP = toNumericPrice(d.price);
      if (numericP != null && (out.price == null || (d.officialPrice && !out.officialPrice))) {
        out.price = numericP;
        out.officialPrice = !!d.officialPrice;
        used = true;
      }
      const desc = stripHTML(d.description);
      if (desc && desc.length > out.description.length + 5) { out.description = desc; used = true; }
      if (!out.image && d.image && /^https?:/i.test(d.image)) { out.image = d.image; used = true; }
      if (!out.seller && d.seller) { out.seller = d.seller; }
      if (!out.status && d.status) { out.status = d.status; }
      if (d.loginWall) out.loginWall = true;
      if (used && !out.sources.includes(src)) out.sources.push(src);
      if (out.price == null && (out.title || out.description)) {
        const inferredPrice = extractPriceFromMetaText(out.title, out.description, '');
        if (inferredPrice != null) out.price = inferredPrice;
      }
      return used;
    };

    const complete = () => out.title && out.price != null && out.description.length > 15 && out.image;
    const found = () => [out.title && '제목', out.price != null && '가격', out.description && '본문', out.image && '이미지'].filter(Boolean).join('·') || '추출 완료';

    // ① 번개장터 URL은 Microlink(OpenGraph)로 넘기지 않고 반드시 번개장터 API JSON에서 데이터 추출
    if (platform.id === 'bunjang') {
      let pid = platform.pid || extractBunjangPid(url);
      if (!pid) {
        onStep('bunjang', 'run', '번개장터 축약/공유 URL에서 상품 번호(PID) 추적 중…');
        pid = await resolveBunjangShortUrl(url);
        if (pid) platform.pid = pid;
      }
      out.pid = pid;

      if (pid) {
        const statusMsg = `번개장터 상품 번호(PID: ${pid}) 확인 -> API 데이터 수신 중...`;
        if (onTitleProgress) onTitleProgress(statusMsg);
        onStep('bunjang', 'run', statusMsg);

        try {
          const r = await stepBunjangForcedAPI(pid, (subLabel) => {
            onStep('bunjang', 'run', `PID: ${pid} 확인 -> ${subLabel} 수신 중...`);
            if (onTitleProgress) onTitleProgress(`번개장터 상품 번호(PID: ${pid}) 확인 -> API 데이터 수신 중... (${subLabel})`);
          });
          merge(r.data, `번개장터 (${r.via})`);
          onStep('bunjang', 'ok', `PID ${pid} · ${r.via} 성공 (${found()})`);
        } catch (e) {
          onStep('bunjang', 'fail', `PID ${pid} API 호출 실패`);
        }
      } else {
        onStep('bunjang', 'fail', '번개장터 상품 번호(PID)를 확인할 수 없음');
      }

      // 번개장터 SPA 웹페이지는 Microlink/OpenGraph 호출 시 기본 사이트 문구만 나오므로 호출하지 않고 생략
      onStep('microlink', 'skip', '번개장터 전용 API JSON 직접 추출 완료');
      onStep('allorigins', 'skip', '번개장터 전용 API JSON 직접 추출 완료');
      return out;
    }

    onStep('bunjang', 'skip', '해당 없음');

    // ② 중고나라 공식 웹사이트(web.joongna.com) 전용 파이프라인:
    // 멀티 프록시(AllOrigins, CodeTabs, CorsProxy)로 HTML을 가져와 ① __NEXT_DATA__ JSON -> ② og:title/og:description/og:image 추출 후, 부족 시 Microlink 병합
    if (platform.id === 'joongna') {
      const pidText = out.pid ? `(상품번호: ${out.pid}) ` : '';
      if (onTitleProgress) onTitleProgress(`중고나라 웹 ${pidText}HTML 및 __NEXT_DATA__ 수신 중...`);
      onStep('allorigins', 'run', `중고나라 ${pidText}멀티 프록시 HTML (__NEXT_DATA__ · OpenGraph) 파싱 중…`);

      try {
        const parsedHtml = await stepHTMLMultiProxy(url, (lbl) => {
          onStep('allorigins', 'run', `중고나라 · ${lbl}`);
          if (onTitleProgress) onTitleProgress(`중고나라 웹 ${pidText}데이터 수신 중... (${lbl})`);
        });
        const used = merge(parsedHtml, `중고나라 웹 (${parsedHtml.via || 'HTML 파서'})`);
        onStep('allorigins', used ? 'ok' : 'skip', used ? `${parsedHtml.fromNextData ? '__NEXT_DATA__ JSON' : 'OpenGraph'} 추출 성공 (${found()})` : 'Microlink 보완 진행');
      } catch (e) {
        onStep('allorigins', 'skip', 'Microlink 프록시로 보완 진행');
      }

      if (complete() || (out.title && out.price != null)) {
        onStep('microlink', 'skip', '중고나라 __NEXT_DATA__ · OpenGraph 데이터 확보 완료');
      } else {
        onStep('microlink', 'run', 'Microlink 프록시로 중고나라 메타데이터 보완 조회 중…');
        try {
          const used = merge(await stepMicrolink(url, 8000), '중고나라 (Microlink)');
          onStep('microlink', used ? 'ok' : 'skip', used ? found() : '추출 데이터 병합 완료');
        } catch (e) {
          onStep('microlink', 'skip', '가용 데이터로 분석 진행');
        }
      }
      return out;
    }

    // ③ 당근마켓 등 기타 플랫폼: Microlink -> 멀티 프록시 HTML OpenGraph 파싱
    if (complete()) {
      onStep('microlink', 'skip', '데이터 확보 완료');
    } else {
      onStep('microlink', 'run', 'api.microlink.io 메타데이터 조회 중…');
      try {
        const used = merge(await stepMicrolink(url, 8000), 'Microlink');
        onStep('microlink', used ? 'ok' : 'skip', used ? found() : 'HTML 파싱으로 계속');
      } catch (e) {
        onStep('microlink', 'skip', 'HTML 파싱으로 전환');
      }
    }

    if (complete()) {
      onStep('allorigins', 'skip', '데이터 확보 완료');
    } else {
      onStep('allorigins', 'run', '멀티프록시 HTML OpenGraph 파싱 중…');
      try {
        const used = merge(await stepHTMLMultiProxy(url, (lbl) => {
          onStep('allorigins', 'run', lbl);
        }), 'OpenGraph HTML 파서');
        onStep('allorigins', used ? 'ok' : 'skip', used ? found() : '메타데이터 병합 완료');
      } catch (e) {
        onStep('allorigins', 'skip', '가용 데이터로 분석 진행');
      }
    }

    return out;
  };

  /* ---------- 하이브리드 실시간 중고 시세 조회 (내장 스마트폰/IT 기기 DB + 일반 물품 등록가 기준 인정) ---------- */
  SD.fetchRealtimeMarketPrice = async function (rawQuery, onProgress, onLiveUpdate, itemPrice) {
    const instantStats = SD.getInstantMarketStats(rawQuery, itemPrice);
    const isBuiltinMatched = Boolean(SD.matchBuiltinMarketModel && SD.matchBuiltinMarketModel(rawQuery));

    // 판매자 가격이 주어진 일반 중고 물품(스타축구공 등 내장 스마트폰/IT DB 미등록 품목)은
    // 임의 추정 시세나 부정확한 검색 결과로 덮어쓰지 않고 판매자 등록 가격을 정상 기준가로 고정
    if (!isBuiltinMatched && itemPrice != null && itemPrice > 0) {
      return instantStats;
    }

    // 하단 시세 조회기에서 가격 없이 단독 검색한 경우에만 백그라운드 라이브 크롤링 시도
    if (!isBuiltinMatched && typeof onLiveUpdate === 'function') {
      const q = SD.extractSearchQuery ? SD.extractSearchQuery(rawQuery) : String(rawQuery || '').trim();
      if (q) {
        (async () => {
          const apiUrl = `https://api.bunjang.co.kr/api/1/find_v2.json?q=${encodeURIComponent(q)}&order=score&page=0&n=40`;
          const urls = [
            apiUrl,
            `https://api.allorigins.win/raw?url=${encodeURIComponent(apiUrl)}`,
            `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(apiUrl)}`,
            `https://corsproxy.io/?${encodeURIComponent(apiUrl)}`
          ];
          for (const u of urls) {
            try {
              const json = await fetchJsonWithTimeout(u, 2200, false);
              if (json && Array.isArray(json.list)) {
                const liveStats = SD.computeRealtimeMarketStats(json.list, q, '번개장터 실시간 매물 크롤링');
                if (liveStats && liveStats.sampleCount >= 4) {
                  onLiveUpdate(liveStats);
                  return;
                }
              }
            } catch (e) { /* 에러 무시 */ }
          }
        })();
      }
    }

    return instantStats;
  };
})(window.SD);

