/* ==========================================================================
   SafeDeal URL Analyzer — app.js
   UI 컨트롤러: URL 분석 · 0.1초 즉시 응답 실시간 시세 조회기 · 대시보드 렌더링 · 테마
   ========================================================================== */
(function (SD) {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = SD.escapeHTML;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const els = {
    homeLogo: $('#homeLogo'),
    form: $('#urlForm'), input: $('#urlInput'), clear: $('#clearBtn'), btn: $('#analyzeBtn'),
    progress: $('#progress'), steps: $('#steps'), progressTitle: $('#progressTitle'),
    miniModal: $('#miniModal'), miniModalForm: $('#miniModalForm'), miniModalNotice: $('#miniModalNotice'),
    miniTitle: $('#miniTitle'), miniPrice: $('#miniPrice'), miniCancel: $('#miniCancel'), miniCloseBtn: $('#miniCloseBtn'),
    manual: $('#manual'), manualForm: $('#manualForm'), manualNotice: $('#manualNotice'),
    mSmart: $('#mSmart'), mTitle: $('#mTitle'), mPrice: $('#mPrice'), mDesc: $('#mDesc'), mDescWrap: $('#mDescWrap'), mCancel: $('#mCancel'),
    results: $('#results'), toast: $('#toast'),
    theme: $('#themeToggle'),
    marketSearchForm: $('#marketSearchForm'),
    marketQueryInput: $('#marketQueryInput'),
    marketSearchBtn: $('#marketSearchBtn'),
    marketResultBox: $('#marketResultBox')
  };

  let busy = false;
  let pendingItem = null;
  let lastItem = null;
  let lastMarketStats = null;
  let originalItemPrice = null;
  let safetyChecklistState = [false, false, false, false];

  /* =========================== 홈 화면 초기화 (resetApp) =========================== */
  function resetApp(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    busy = false;
    pendingItem = null;
    lastItem = null;
    originalItemPrice = null;
    safetyChecklistState = [false, false, false, false];
    els.input.value = '';
    els.clear.hidden = true;
    els.btn.disabled = false;
    els.btn.classList.remove('loading');
    $$('.preset').forEach((p) => { p.disabled = false; p.classList.remove('active'); });
    els.progress.hidden = true;
    els.manual.hidden = true;
    if (els.miniModal) els.miniModal.hidden = true;
    els.results.hidden = true;
    els.results.innerHTML = '';
    if (els.mSmart) els.mSmart.value = '';
    els.mTitle.value = '';
    els.mPrice.value = '';
    els.mDesc.value = '';
    if (els.miniTitle) els.miniTitle.value = '';
    if (els.miniPrice) els.miniPrice.value = '';
    try {
      if (location.search && history.replaceState) {
        history.replaceState(null, '', location.pathname);
      }
    } catch (err) { /* file:/// 환경 안전 무시 */ }
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    setTimeout(() => els.input.focus({ preventScroll: true }), 150);
  }
  SD.resetApp = resetApp;
  if (els.homeLogo) els.homeLogo.addEventListener('click', resetApp);

  /* =========================== 테마 (구글 크롬 라이트 모드 기본) =========================== */
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    els.theme.setAttribute('aria-label', t === 'dark' ? '구글 크롬 라이트 모드로 전환' : '구글 크롬 다크 모드로 전환');
    els.theme.title = els.theme.getAttribute('aria-label');
  }
  applyTheme(document.documentElement.dataset.theme || 'light');
  els.theme.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem('sd-chrome-theme', next); } catch (e) { /* noop */ }
  });

  /* =========================== 토스트 & 복사 =========================== */
  let toastTimer;
  function toast(msg, type = 'ok') {
    els.toast.textContent = msg;
    els.toast.className = 'toast show ' + type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.className = 'toast'; }, 2600);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  /* =========================== 진행 단계 =========================== */
  const STEPS = [
    { id: 'detect', label: 'URL · 플랫폼 판별', api: '' },
    { id: 'bunjang', label: '번개장터 신형(v2) · 구형(v1) API', api: 'direct · corsproxy · allorigins · codetabs' },
    { id: 'microlink', label: 'OpenGraph 메타데이터 추출', api: 'api.microlink.io' },
    { id: 'allorigins', label: '멀티 프록시 __NEXT_DATA__ · OpenGraph 파싱', api: 'allorigins · corsproxy · codetabs' },
    { id: 'analyze', label: '실시간 중고 시세 계산 & 위험 분석', api: 'SafeDeal Hybrid Engine' }
  ];
  const STATUS_TEXT = { wait: '대기', run: '진행 중', ok: '완료', skip: '생략', fail: '실패', warn: '부분 성공' };

  function resetSteps() {
    els.steps.innerHTML = STEPS.map((s, i) => `
      <li class="step" data-step="${s.id}" data-status="wait">
        <span class="step-dot" aria-hidden="true"><b>${i + 1}</b></span>
        <div class="step-body">
          <div class="step-head"><strong>${s.label}</strong>${s.api ? `<code>${s.api}</code>` : ''}</div>
          <div class="step-msg">${STATUS_TEXT.wait}</div>
        </div>
      </li>`).join('');
  }
  function setStep(id, status, msg) {
    const li = els.steps.querySelector(`[data-step="${id}"]`);
    if (!li) return;
    li.dataset.status = status;
    $('.step-msg', li).textContent = msg ? `${STATUS_TEXT[status]} · ${msg}` : STATUS_TEXT[status];
  }

  function setBusy(b) {
    busy = b;
    els.btn.disabled = b;
    els.btn.classList.toggle('loading', b);
    $$('.preset').forEach((p) => { p.disabled = b; });
  }

  /* =========================== 네이버 카페 전용 1초 미니 입력 모달 ([상품명 / 판매 가격] 2칸) =========================== */
  function openMiniModal(item, noticeHtml) {
    pendingItem = Object.assign({ platform: 'naver', platformName: '네이버 카페', sources: ['네이버 카페 미니 입력'] }, item || {});
    if (els.miniModalNotice && noticeHtml) {
      els.miniModalNotice.innerHTML = noticeHtml;
    }
    if (els.miniTitle) els.miniTitle.value = pendingItem.title || '';
    if (els.miniPrice) els.miniPrice.value = pendingItem.price != null ? Number(pendingItem.price).toLocaleString('ko-KR') : '';
    if (els.miniModal) {
      els.miniModal.hidden = false;
      setTimeout(() => {
        if (els.miniTitle) els.miniTitle.focus();
      }, 80);
    }
  }

  function closeMiniModal() {
    if (els.miniModal) els.miniModal.hidden = true;
  }

  if (els.miniCancel) els.miniCancel.addEventListener('click', closeMiniModal);
  if (els.miniCloseBtn) els.miniCloseBtn.addEventListener('click', closeMiniModal);
  if (els.miniModal) {
    els.miniModal.addEventListener('click', (e) => {
      if (e.target === els.miniModal) closeMiniModal();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && els.miniModal && !els.miniModal.hidden) {
      closeMiniModal();
    }
  });

  if (els.miniModalForm) {
    els.miniModalForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      let title = els.miniTitle ? els.miniTitle.value.trim() : '';
      let price = els.miniPrice ? SD.normalizePrice(els.miniPrice.value.trim()) : null;

      if (price == null && title) {
        price = SD.parsePrice(title);
      }
      if (!title && price != null) {
        title = (pendingItem && pendingItem.platformName ? `${pendingItem.platformName} 매물` : '네이버 카페 중고 매물');
      }
      if (!title || price == null) {
        if (!title && els.miniTitle) els.miniTitle.focus();
        else if (els.miniPrice) els.miniPrice.focus();
        toast('상품명과 판매 가격을 입력해 주세요', 'warn');
        return;
      }

      const item = Object.assign({}, pendingItem, {
        title,
        price,
        officialPrice: true,
        manual: true,
        sources: [...new Set([...(pendingItem && pendingItem.sources ? pendingItem.sources : []), '1초 미니 입력'])]
      });
      closeMiniModal();
      await finishAnalysis(item, { skipSteps: true });
    });
  }

  /* =========================== 빠른 스마트 입력 카드 =========================== */
  function parseSmartBlob(blob) {
    const lines = String(blob || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const title = lines[0] ? lines[0].slice(0, 120) : '';
    const desc = lines.length > 1 ? lines.slice(1).join('\n') : (lines[0] || '');
    const price = SD.parsePrice(blob);
    return { title, desc, price, platform: 'other', platformName: '스마트 입력' };
  }

  function openManual(item, notice) {
    pendingItem = Object.assign({ platform: 'other', platformName: '스마트 입력', sources: [] }, item || {});
    els.manualNotice.innerHTML = notice;
    if (els.mSmart) els.mSmart.value = '';
    els.mTitle.value = pendingItem.title || '';
    els.mPrice.value = pendingItem.price != null ? Number(pendingItem.price).toLocaleString('ko-KR') : '';
    els.mDesc.value = pendingItem.description || '';
    els.mDescWrap.open = !!pendingItem.description;
    els.manual.hidden = false;
    els.manual.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    setTimeout(() => {
      const target = (!els.mTitle.value && els.mSmart) ? els.mSmart : (els.mTitle.value ? els.mPrice : els.mTitle);
      if (target) target.focus({ preventScroll: true });
    }, 300);
  }

  if (els.mSmart) {
    els.mSmart.addEventListener('input', () => {
      const raw = els.mSmart.value.trim();
      if (!raw) return;
      const parsed = parseSmartBlob(raw);
      if (parsed.title) els.mTitle.value = parsed.title;
      if (parsed.price != null) els.mPrice.value = parsed.price.toLocaleString('ko-KR');
      if (parsed.desc) {
        els.mDesc.value = parsed.desc;
        els.mDescWrap.open = true;
      }
    });
  }

  els.manualForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const smartRaw = els.mSmart ? els.mSmart.value.trim() : '';
    let title = els.mTitle.value.trim();
    let desc = els.mDesc.value.trim();
    let price = SD.normalizePrice(els.mPrice.value.trim());

    if (smartRaw && (!title || !desc || price == null)) {
      const p = parseSmartBlob(smartRaw);
      if (!title && p.title) title = p.title;
      if (!desc && p.desc) desc = p.desc;
      if (price == null && p.price != null) price = p.price;
    }
    if (!title && desc) {
      const p = parseSmartBlob(desc);
      title = p.title || desc.split(/\r?\n/).map((s) => s.trim()).find(Boolean).slice(0, 120);
    }
    if (price == null) price = SD.parsePrice(title + '\n' + desc);
    if (!title && price != null) {
      title = (pendingItem && pendingItem.platformName ? `${pendingItem.platformName} 매물` : '중고 거래 매물');
    }
    if (!title && price == null) {
      (els.mSmart || els.mTitle).focus();
      toast('거래글 텍스트를 붙여넣거나 제목 또는 가격을 입력해 주세요', 'warn');
      return;
    }

    const item = Object.assign({}, pendingItem, {
      title, price, description: desc, manual: true,
      sources: [...new Set([...(pendingItem.sources || []), '스마트 입력'])]
    });
    els.manual.hidden = true;
    await finishAnalysis(item, { skipSteps: true });
  });
  els.mCancel.addEventListener('click', () => { els.manual.hidden = true; });

  /* =========================== 메인 플로우 =========================== */
  async function runAnalysis(raw) {
    if (busy) return;
    originalItemPrice = null;
    const trimmed = (raw || '').trim();
    const url = SD.normalizeUrl(trimmed);
    els.results.hidden = true;
    els.manual.hidden = true;
    if (els.miniModal) els.miniModal.hidden = true;

    if (!url) {
      if (!trimmed) {
        toast('분석할 중고거래 게시글 URL을 입력해 주세요', 'warn');
        els.input.focus();
        return;
      }
      const parsed = parseSmartBlob(trimmed);
      if (parsed.title && parsed.price != null) {
        await finishAnalysis({
          title: parsed.title,
          price: parsed.price,
          description: parsed.desc,
          platform: 'other',
          platformName: '스마트 분석',
          sources: ['텍스트 직접 분석']
        }, { skipSteps: true });
        return;
      }
      // 만약 모델명만 입력한 경우 시세 조회기로 즉시 응답
      runMarketLookup(trimmed);
      if (els.marketResultBox) {
        els.marketResultBox.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      }
      return;
    }

    const platform = SD.detectPlatform(url);

    // 네이버 카페(cafe.naver.com) URL 입력 시 에러나 대기 없이 즉시 2칸 미니 입력 모달 표시
    if (platform && platform.id === 'naver') {
      els.progress.hidden = true;
      setBusy(false);
      openMiniModal(
        { url, platform: platform.id, platformName: platform.name, sources: ['네이버 카페 미니 입력'] },
        '네이버 카페 게시글은 로그인 보안 정책상 외부 추출이 제한됩니다. <b>상품명과 판매 가격 2칸</b>만 입력하면 1초 만에 적정 시세·위험도 대시보드가 열립니다.'
      );
      return;
    }

    setBusy(true);
    resetSteps();
    els.progressTitle.textContent = '거래글 정보를 가져오는 중…';
    els.progress.hidden = false;
    els.progress.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });

    try {
      setStep('detect', 'run');
      if (platform.id === 'bunjang' && platform.pid) {
        els.progressTitle.textContent = `번개장터 상품 번호(PID: ${platform.pid}) 확인 -> API 데이터 수신 중...`;
      } else if (platform.id === 'joongna') {
        els.progressTitle.textContent = `중고나라 웹${platform.pid ? ` (상품번호: ${platform.pid})` : ''} 확인 -> __NEXT_DATA__ · OpenGraph 수신 중...`;
      }
      await sleep(140);
      setStep('detect', 'ok', platform.name + (platform.pid ? ` · 상품 번호(${platform.pid}) 확인` : ''));

      const demoKey = Object.keys(SD.DEMO_FIXTURES).find((k) => url.includes(k));
      let item;

      if (demoKey) {
        for (const id of ['bunjang', 'microlink', 'allorigins']) {
          setStep(id, 'run');
          await sleep(120);
          setStep(id, 'skip', '시연 모드 · 내장 샘플 데이터 사용');
        }
        item = Object.assign({}, SD.DEMO_FIXTURES[demoKey], {
          url, platform: platform.id, platformName: platform.name, demo: true, sources: ['시연용 내장 데이터']
        });
      } else {
        const data = await SD.fetchListing(url, platform, setStep, (statusText) => {
          els.progressTitle.textContent = statusText;
        });
        item = Object.assign({}, data, { url, platform: platform.id, platformName: platform.name });

        if (item.price != null) {
          const numPrice = Number(String(item.price).replace(/[^\d]/g, ''));
          item.price = Number.isFinite(numPrice) && numPrice > 0 ? numPrice : SD.normalizePrice(item.price);
        }
        if (item.price == null && (item.title || item.description)) {
          item.price = SD.parsePrice((item.title || '') + '\n' + (item.description || ''));
        }

        if (platform.id === 'bunjang') {
          const pidLabel = item.pid || platform.pid || '';
          if (!item.title) {
            item.title = pidLabel ? `번개장터 상품 (PID: ${pidLabel})` : '번개장터 중고거래 매물';
          }
          await finishAnalysis(item, {});
          return;
        }

        if (platform.id === 'joongna' && (item.title || item.price != null || (item.description && item.description.length > 5))) {
          const pidLabel = item.pid || platform.pid || '';
          if (!item.title) {
            item.title = pidLabel ? `중고나라 상품 (번호: ${pidLabel})` : '중고나라 중고거래 매물';
          }
          await finishAnalysis(item, {});
          return;
        }

        const hasExtractedInfo = Boolean(item.title || item.price != null || (item.description && item.description.length > 10));
        if (!hasExtractedInfo) {
          setStep('analyze', 'ok', '1초 미니 입력 대기');
          els.progressTitle.textContent = '⚡ 1초 미니 입력으로 즉시 분석을 완료하세요';
          setBusy(false);
          openMiniModal(
            item,
            `<b>${esc(platform.name)}</b> 보안 정책으로 인해 외부 자동 추출이 제한되었습니다. <b>상품명과 판매 가격 2칸</b>만 입력하면 1초 만에 대시보드 분석이 완료됩니다!`
          );
          return;
        }
      }
      await finishAnalysis(item, {});
    } catch (err) {
      setBusy(false);
      openMiniModal(
        { url: raw },
        '외부 보안 정책으로 인해 자동 추출이 제한되었습니다. <b>상품명과 판매 가격 2칸</b>만 입력하면 1초 만에 대시보드 분석이 완료됩니다!'
      );
    }
  }

  async function finishAnalysis(item, opts = {}) {
    setBusy(true);
    if (opts.skipSteps) {
      if (els.progress.hidden) { resetSteps(); els.progress.hidden = false; }
      ['detect', 'bunjang', 'microlink', 'allorigins'].forEach((id) => {
        const li = els.steps.querySelector(`[data-step="${id}"]`);
        if (li && li.dataset.status === 'wait') setStep(id, 'skip', '스마트 입력 연동');
      });
    }
    setStep('analyze', 'run', '실시간 중고 시세 및 위험도 즉시 분석 중…');

    const prelim = SD.analyze(item);
    if (!prelim.banned) {
      const searchQ = (item.searchQuery || SD.extractSearchQuery(item.title || '') || item.title || '중고 물품').trim();
      item.marketQuery = searchQ;
      const isBuiltin = Boolean(SD.matchBuiltinMarketModel && (SD.matchBuiltinMarketModel(searchQ) || SD.matchBuiltinMarketModel(item.title || '')));
      if (isBuiltin && els.marketQueryInput) {
        els.marketQueryInput.value = searchQ;
        highlightPopularChip(searchQ);
      }

      const market = await SD.fetchRealtimeMarketPrice(searchQ, null, (liveStats) => {
        if (!isBuiltin && item.price != null) return;
        lastMarketStats = liveStats;
        renderMarketResultBox(liveStats);
        if (lastItem && !els.results.hidden) {
          lastItem.realtimeMarket = liveStats;
          render(SD.analyze(lastItem), { preserveScroll: true });
        }
      }, item.price);

      item.realtimeMarket = market;
      if (isBuiltin) {
        lastMarketStats = market;
        renderMarketResultBox(market);
      }
    }

    const r = SD.analyze(item);
    if (!r.banned && r.priceInfo && r.priceInfo.market && !r.priceInfo.market.isGeneralItem) {
      lastMarketStats = r.priceInfo.market;
      if (els.marketQueryInput) els.marketQueryInput.value = r.priceInfo.market.query;
      highlightPopularChip(r.priceInfo.market.query);
      renderMarketResultBox(r.priceInfo.market, r.condition.grade);
    }
    setStep('analyze', 'ok', `위험도 ${r.score}점 · ${r.level.label}`);
    els.progressTitle.textContent = item.pid
      ? `${item.platformName || '상품'} 번호(${item.pid}) 데이터 수신 및 위험도 분석 완료`
      : '분석 완료';
    lastItem = item;
    if (item.price != null && originalItemPrice == null) {
      originalItemPrice = item.price;
    }
    render(r);
    setBusy(false);
  }

  /* =========================== 실시간 시세 요약 카드 HTML 생성 (단일 카드 요약 · 2026년 11월 DB 100% 동기화) =========================== */
  function buildRealtimeSummaryCardHTML(market, opts = {}) {
    if (!market) return '';

    if (market.isGeneralItem) {
      const refPrice = opts.listedPrice != null ? opts.listedPrice : market.avg;
      const priceStr = refPrice != null ? SD.won(refPrice) : '판매자 등록 가격';
      return `
        <div class="rt-summary-card">
          <div class="rt-summary-top">
            <span class="rt-sample-badge">📦 일반 중고 물품 · <span class="rt-model-tag">${esc(market.query)}</span></span>
            <span class="rt-method-hint">시세 괴리 0점 처리 · 사기 키워드 및 거래 패턴 중심 분석</span>
          </div>
          <div class="rt-main-price-row">
            <div class="rt-main-label">판매자 등록 기준가 인정</div>
            <div class="rt-main-value">
              <strong>${priceStr}</strong>
              <span class="rt-range">(일반 중고 물품 · 판매가 ${priceStr} 기준 정상 인정)</span>
            </div>
          </div>
        </div>`;
    }

    const activeGrade = opts.activeGrade || 'A급';
    const isUnopened = activeGrade === '미개봉';
    const isS = activeGrade === 'S급';
    const isA = activeGrade === 'A급';
    const isB = activeGrade === 'B급';
    const interactiveGrade = Boolean(opts.interactiveGrade);
    const unopenedPrice = market.unopened || market.unopenedS || Math.round((market.avg * 1.25) / 10000) * 10000;
    const sGradePrice = market.sGrade || Math.round((market.avg * 1.10) / 10000) * 10000;
    const aGradePrice = market.aGrade || market.avg;
    const bGradePrice = market.bGrade || Math.round((market.avg * 0.80) / 10000) * 10000;
    const activeExpected = (market.gradePrices && market.gradePrices[activeGrade]) || aGradePrice;
    const activeLabel = activeGrade === 'A급'
      ? '중고 평균 시세 (A급 기준)'
      : `${activeGrade} 기준 적정 시세 (A급 평균 ${SD.manwon(aGradePrice)})`;
    const retailBadge = market.retailPrice
      ? `<span class="rt-retail-badge">출고가/새제품 약 ${SD.manwon(market.retailPrice)}</span>`
      : '';

    return `
      <div class="rt-summary-card">
        <div class="rt-summary-top">
          <span class="rt-sample-badge">📡 2026년 11월 기준 실제 중고 시세 DB · <span class="rt-model-tag">${esc(market.query)}</span> ${retailBadge}</span>
          <span class="rt-method-hint">선택 등급: <b>${esc(activeGrade)}</b> · 클릭 시 등급별 기준 시세 즉시 전환</span>
        </div>

        <div class="rt-main-price-row">
          <div class="rt-main-label">${esc(activeLabel)}</div>
          <div class="rt-main-value">
            <strong>${SD.won(activeExpected)}</strong>
            <span class="rt-range">(B급 ${SD.manwon(bGradePrice)} ~ 미개봉 ${SD.manwon(unopenedPrice)})</span>
          </div>
        </div>

        <div class="rt-grade-line" role="group" aria-label="상태별 예상 적정가 (클릭하여 비교 기준 전환)">
          <button type="button" class="rt-grade-item ${isUnopened ? 'active' : ''}" ${interactiveGrade ? 'data-rt-grade="미개봉"' : ''} title="미개봉 시세 (A급의 약 125%)">
            <span class="rt-g-name">미개봉 시세 <small>(새상품)</small></span>
            <strong class="rt-g-val">${SD.won(unopenedPrice)}</strong>
          </button>
          <span class="rt-grade-sep" aria-hidden="true">|</span>
          <button type="button" class="rt-grade-item ${isS ? 'active' : ''}" ${interactiveGrade ? 'data-rt-grade="S급"' : ''} title="S급 적정가 (A급의 약 110%)">
            <span class="rt-g-name">S급 적정가 <small>(초미세)</small></span>
            <strong class="rt-g-val">${SD.won(sGradePrice)}</strong>
          </button>
          <span class="rt-grade-sep" aria-hidden="true">|</span>
          <button type="button" class="rt-grade-item ${isA ? 'active' : ''}" ${interactiveGrade ? 'data-rt-grade="A급"' : ''} title="A급 기준 적정 시세">
            <span class="rt-g-name">중고 평균 (A급) <small>(기준가)</small></span>
            <strong class="rt-g-val">${SD.won(aGradePrice)}</strong>
          </button>
          <span class="rt-grade-sep" aria-hidden="true">|</span>
          <button type="button" class="rt-grade-item ${isB ? 'active' : ''}" ${interactiveGrade ? 'data-rt-grade="B급"' : ''} title="B급/사용감 적정 시세 (A급의 약 80%)">
            <span class="rt-g-name">B급/사용감 <small>(사용감있음)</small></span>
            <strong class="rt-g-val">${SD.won(bGradePrice)}</strong>
          </button>
        </div>
      </div>`;
  }

  /* =========================== 🔍 외부 플랫폼 실시간 시세 직접 검색 허브 HTML =========================== */
  function buildExternalMarketHubHTML(rawQuery, imageUrl) {
    const q = (rawQuery || '중고 매물').trim();
    const encodedQ = encodeURIComponent(q);
    const bunjangUrl = `https://m.bunjang.co.kr/search/products?q=${encodedQ}`;
    const joongnaUrl = `https://web.joongna.com/search/${encodedQ}`;
    const naverUrl = `https://search.shopping.naver.com/search/all?query=${encodedQ}`;
    const lensUrl = imageUrl && /^https?:\/\//i.test(imageUrl)
      ? `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}`
      : `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q + ' 실사')}`;

    return `
      <div class="ext-market-hub no-print">
        <div class="ext-hub-head">
          <div class="ext-hub-title-row">
            <span class="ext-hub-badge">🔍 외부 플랫폼 실시간 교차 검증 허브</span>
            <span class="ext-hub-sub">원클릭으로 주요 중고 플랫폼 실매물과 네이버 쇼핑 최저가를 직접 교차 확인하세요</span>
          </div>
        </div>
        <div class="ext-hub-grid">
          <a href="${bunjangUrl}" target="_blank" rel="noopener noreferrer" class="ext-hub-btn btn-bunjang" title="번개장터에서 '${esc(q)}' 실시간 매물 검색">
            <span class="ext-hub-icon">⚡</span>
            <div class="ext-hub-info">
              <strong>번개장터 실매물 검색</strong>
              <small>m.bunjang.co.kr ↗</small>
            </div>
          </a>
          <a href="${joongnaUrl}" target="_blank" rel="noopener noreferrer" class="ext-hub-btn btn-joongna" title="중고나라에서 '${esc(q)}' 실시간 매물 검색">
            <span class="ext-hub-icon">🛒</span>
            <div class="ext-hub-info">
              <strong>중고나라 실매물 검색</strong>
              <small>web.joongna.com ↗</small>
            </div>
          </a>
          <a href="${naverUrl}" target="_blank" rel="noopener noreferrer" class="ext-hub-btn btn-naver" title="네이버 쇼핑에서 최저가 및 신품/리퍼 시세 조회">
            <span class="ext-hub-icon">💚</span>
            <div class="ext-hub-info">
              <strong>네이버 쇼핑 최저가 조회</strong>
              <small>search.shopping.naver.com ↗</small>
            </div>
          </a>
          <a href="${lensUrl}" target="_blank" rel="noopener noreferrer" class="ext-hub-btn btn-lens" title="구글 렌즈로 등록 사진 도용 여부 검색">
            <span class="ext-hub-icon">📷</span>
            <div class="ext-hub-info">
              <strong>구글 렌즈 사진 도용 확인</strong>
              <small>lens.google.com ↗</small>
            </div>
          </a>
        </div>
      </div>`;
  }

  /* =========================== 🎛️ 실시간 가격 네고 & 시세 직접 입력 시뮬레이터 HTML =========================== */
  function buildSimulatorHTML(r, market) {
    const it = r.item || {};
    const expected = (r.priceInfo && r.priceInfo.expectedPrice) || (market && market.avg) || it.price || 500000;
    const currentVal = it.price != null ? it.price : expected;

    const sliderMin = Math.max(10000, Math.round((expected * 0.25) / 10000) * 10000);
    const sliderMax = Math.max(sliderMin + 200000, Math.round((expected * 1.80) / 10000) * 10000);
    const sliderStep = 10000;

    const diffWon = currentVal - expected;
    const diffPct = Math.round((diffWon / expected) * 100);
    let diffBadgeText = '';
    let diffBadgeClass = 'good';
    if (diffWon === 0) {
      diffBadgeText = '적정가와 일치 (0%)';
      diffBadgeClass = 'good';
    } else if (diffWon < 0) {
      diffBadgeText = `적정가 대비 -${Math.abs(diffPct)}% (${SD.won(Math.abs(diffWon))} 저렴)`;
      diffBadgeClass = diffPct <= -45 ? 'bad' : (diffPct <= -25 ? 'warn' : 'good');
    } else {
      diffBadgeText = `적정가 대비 +${diffPct}% (${SD.won(diffWon)} 비쌈)`;
      diffBadgeClass = diffPct >= 20 ? 'over' : 'good';
    }

    const customMarketVal = (market && market.isCustom) ? market.avg.toLocaleString('ko-KR') : '';

    return `
      <div class="simulator-box no-print">
        <div class="sim-header">
          <div class="sim-title-wrap">
            <span class="sim-badge">🎛️ 인터랙티브 시뮬레이터</span>
            <h4 class="sim-heading">실시간 가격 네고 &amp; 시세 직접 입력 시뮬레이터</h4>
          </div>
          <span class="sim-hint">슬라이더를 드래그해 네고 가격을 조절하거나, 내가 알고 있는 시세를 직접 입력하여 실시간 위험도 변화를 확인하세요</span>
        </div>

        <div class="sim-grid">
          <!-- 1. 가격 네고 슬라이더 -->
          <div class="sim-card sim-slider-card">
            <div class="sim-card-top">
              <span class="sim-card-label">💰 실시간 가격 네고 슬라이더</span>
              <div class="sim-val-wrap">
                <span class="sim-cur-val" id="simSliderValText">${SD.won(currentVal)}</span>
                <span class="sim-cur-diff sim-diff-${diffBadgeClass}" id="simSliderDiffBadge">${diffBadgeText}</span>
              </div>
            </div>
            <div class="sim-slider-container">
              <input type="range" id="priceNegoSlider" class="sim-range-input"
                min="${sliderMin}" max="${sliderMax}" step="${sliderStep}" value="${currentVal}"
                aria-label="판매 가격 네고 슬라이더">
              <div class="sim-ticks">
                <span>최저 ${SD.manwon(sliderMin)}</span>
                <span class="tick-expected">🎯 예상 적정가: ${SD.manwon(expected)}</span>
                <span>최고 ${SD.manwon(sliderMax)}</span>
              </div>
            </div>
            <div class="sim-presets-bar" role="group" aria-label="빠른 가격 네고 프리셋">
              <span class="sim-preset-label">⚡ 퀵 네고:</span>
              <button type="button" class="sim-preset-btn" data-nego="-10">-10% 네고</button>
              <button type="button" class="sim-preset-btn" data-nego="-50000">-5만원 네고</button>
              <button type="button" class="sim-preset-btn" data-nego="fair">적정가 맞춤</button>
              <button type="button" class="sim-preset-btn" data-nego="+50000">+5만원 인상</button>
              <button type="button" class="sim-preset-btn" data-nego="reset">원래 등록가</button>
            </div>
          </div>

          <!-- 2. 시세 직접 입력 커스텀 폼 -->
          <div class="sim-card sim-market-card">
            <div class="sim-card-top">
              <span class="sim-card-label">📊 기준 시세 직접 입력</span>
              <span class="sim-market-mode">${market && market.isCustom ? '⭐ 사용자 직접 입력 시세 적용 중' : '기본: 2026년 11월 DB 시세'}</span>
            </div>
            <form id="simCustomMarketForm" class="sim-market-form" autocomplete="off" novalidate>
              <p class="sim-market-desc">특정 옵션·사설 수리 등 내가 알고 있는 다른 기준 시세가 있다면 직접 입력해 대시보드 전체를 재평가하세요.</p>
              <div class="sim-market-input-group">
                <input type="text" id="simCustomMarketInput" class="sim-market-input"
                  placeholder="예: 75만원 또는 750000"
                  value="${customMarketVal ? customMarketVal + '원' : ''}"
                  aria-label="기준 시세 직접 입력">
                <button type="submit" class="btn-primary btn-sm">시세 적용</button>
                <button type="button" id="simResetMarketBtn" class="btn-ghost btn-sm" title="2026년 11월 내장 DB 기본 시세로 복원">↺ 기본 시세 복원</button>
              </div>
            </form>
          </div>
        </div>
      </div>`;
  }

  /* =========================== 하단 『🔍 실시간 중고 시세 조회기』 제어 (상단 분석 결과와 100% 자동 동기화) =========================== */
  let currentLookupGrade = 'A급';

  function detectQueryGrade(q) {
    if (!q) return null;
    if (/(?:^|[^a-z])[bc]\s*급|사용감|상처|하자/i.test(q)) return 'B급';
    if (/(?:^|[^a-z])s\s*급|초미세|민트/i.test(q)) return 'S급';
    if (/미개봉|새\s*상품|미개통/i.test(q)) return '미개봉';
    if (/(?:^|[^a-z])a\s*급/i.test(q)) return 'A급';
    return null;
  }

  function highlightPopularChip(query) {
    const normInput = SD.normalizeModelQuery ? SD.normalizeModelQuery(query) : String(query || '').trim().toLowerCase();
    $$('[data-market-chip]').forEach((chip) => {
      const normChip = SD.normalizeModelQuery ? SD.normalizeModelQuery(chip.dataset.marketChip) : chip.dataset.marketChip.toLowerCase();
      chip.classList.toggle('active', Boolean(normInput && normInput === normChip));
    });
  }

  function renderMarketResultBox(market, forcedGrade) {
    if (!els.marketResultBox || !market) return;
    if (forcedGrade && SD.CONDITIONS[forcedGrade]) {
      currentLookupGrade = forcedGrade;
    }
    const gradeToUse = forcedGrade || (lastItem && lastItem.selectedGrade) || currentLookupGrade || 'A급';
    const summaryHtml = buildRealtimeSummaryCardHTML(market, {
      activeGrade: gradeToUse,
      interactiveGrade: true
    });
    const hubHtml = buildExternalMarketHubHTML(market.query || '', (lastItem && lastItem.image) || null);
    els.marketResultBox.innerHTML = summaryHtml + hubHtml;
    $$('[data-rt-grade]', els.marketResultBox).forEach((btn) => {
      btn.addEventListener('click', () => {
        currentLookupGrade = btn.dataset.rtGrade;
        if (lastItem && !els.results.hidden) {
          updateConditionGradeInstant(btn.dataset.rtGrade);
        } else {
          renderMarketResultBox(market, btn.dataset.rtGrade);
        }
      });
    });
  }

  function runMarketLookup(rawQuery, opts = {}) {
    const q = String(rawQuery || '').trim();
    if (!q) {
      if (els.marketQueryInput) els.marketQueryInput.focus();
      return;
    }
    if (els.marketQueryInput) els.marketQueryInput.value = q;
    highlightPopularChip(q);

    const detectedGrade = detectQueryGrade(q) || (lastItem && lastItem.selectedGrade) || 'A급';
    currentLookupGrade = detectedGrade;

    // 2026년 11월 내장 시세 DB 기반 0.1초 즉시 시세 산출
    const market = SD.getInstantMarketStats(q);
    lastMarketStats = market;
    renderMarketResultBox(market, detectedGrade);

    // 대시보드가 열려 있고 금지 품목이 아니면 상단 분석 결과와 즉시 동기화
    if (lastItem && !els.results.hidden) {
      const curCheck = SD.analyze(lastItem);
      if (!curCheck.banned) {
        lastItem = Object.assign({}, lastItem, {
          marketQuery: market.query,
          realtimeMarket: market,
          selectedGrade: detectQueryGrade(q) || lastItem.selectedGrade,
          sources: [...new Set([...(lastItem.sources || []), `2026 시세 DB 연동 (${market.query})`])]
        });
        const updated = SD.analyze(lastItem);
        render(updated, { preserveScroll: true });
      }
    }

    // 내장 DB에 등록되지 않은 기타 품목인 경우에만 백그라운드 검색 보강 (내장 스마트폰 DB는 절대 덮어쓰지 않음)
    if (!SD.matchBuiltinMarketModel(q)) {
      SD.fetchRealtimeMarketPrice(q, null, (liveStats) => {
        lastMarketStats = liveStats;
        renderMarketResultBox(liveStats, detectedGrade);
      });
    }
  }

  if (els.marketSearchForm) {
    els.marketSearchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      runMarketLookup(els.marketQueryInput ? els.marketQueryInput.value : '');
    });
  }

  $$('[data-market-chip]').forEach((chip) => {
    chip.addEventListener('click', () => {
      runMarketLookup(chip.dataset.marketChip);
    });
  });

  /* =========================== 인라인 판매 가격 & 상태 등급 즉시 재계산 =========================== */
  function updatePriceInstant(newPrice, opts = {}) {
    if (!lastItem) return;
    const p = SD.normalizePrice(newPrice);
    if (p == null || p < 1000) {
      toast('유효한 판매 가격을 입력해 주세요 (예: 850000 또는 85만원)', 'warn');
      return;
    }
    lastItem = Object.assign({}, lastItem, {
      price: p,
      officialPrice: true,
      sources: [...new Set([...(lastItem.sources || []), '가격 직접 보정'])]
    });
    const r = SD.analyze(lastItem);
    render(r, { preserveScroll: true, fromSlider: Boolean(opts.fromSlider) });
    if (!opts.silentToast) {
      toast(`⚡ 판매가를 ${SD.won(p)}(${SD.manwon(p)})으로 변경해 실시간 시세 대비 위험도를 즉시 재계산했어요!`);
    }
  }

  function updateConditionGradeInstant(newGrade) {
    if (!lastItem || !SD.CONDITIONS[newGrade]) return;
    currentLookupGrade = newGrade;
    lastItem = Object.assign({}, lastItem, {
      selectedGrade: newGrade
    });
    const r = SD.analyze(lastItem);
    render(r, { preserveScroll: true });
    if (lastMarketStats) {
      renderMarketResultBox(lastMarketStats, newGrade);
    }
    toast(`✨ 상품 상태를 [${newGrade}] 기준으로 전환해 적정가를 재계산했어요!`);
  }

  /* =========================== 렌더링 =========================== */
  const PLATFORM_CLASS = { bunjang: 'pf-bunjang', daangn: 'pf-daangn', joongna: 'pf-joongna', naver: 'pf-joongna', other: 'pf-other' };
  const CAT_ICON = { iphone: '🍎', galaxy: '🌌' };

  const PLACEHOLDER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="#f1f3f4"/><path d="M130 260l50-60 40 45 30-35 50 50z" fill="#bdc1c6"/><circle cx="160" cy="160" r="22" fill="#bdc1c6"/><text x="200" y="320" font-family="sans-serif" font-size="18" fill="#5f6368" text-anchor="middle">이미지 없음</text></svg>');

  function safeImg(src) {
    return /^(https?:|data:image\/)/i.test(src || '') ? src : PLACEHOLDER;
  }

  function renderReportToolbar(r) {
    const nowStr = new Date().toLocaleString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    });
    return `
      <div class="report-toolbar">
        <div class="report-toolbar-left">
          <span class="safe-browsing-badge">🛡️ Google Safe Browsing 스타일 실시간 거래 진단 리포트</span>
          <span class="report-timestamp">진단 시각: ${esc(nowStr)}</span>
        </div>
        <div class="report-toolbar-right no-print">
          <button type="button" class="btn-print-report" data-action="print-report" title="현재 진단 대시보드를 A4 리포트 또는 PDF로 인쇄/저장합니다">
            🖨️ 진단 리포트 저장
          </button>
        </div>
      </div>`;
  }

  function render(r, renderOpts = {}) {
    const it = r.item;
    const lv = r.level;
    const html = [];

    html.push(renderReportToolbar(r));
    html.push(`<div class="grid grid-top">${renderProduct(r)}${renderGauge(r)}${renderBreakdown(r)}</div>`);
    html.push(`<div class="grid grid-mid">${renderPrice(r)}</div>`);
    html.push(`<div class="grid grid-bottom">${renderKeywords(r)}${renderTips(r)}</div>`);
    html.push(`<div class="grid grid-bottom-interactive">${renderScript(r)}${renderSafetyChecklistCard(r)}</div>`);

    els.results.className = 'results lv-' + lv.key;
    els.results.innerHTML = html.join('');
    els.results.hidden = false;

    const img = $('.product-thumb img', els.results);
    if (img) img.addEventListener('error', () => { img.src = PLACEHOLDER; }, { once: true });
    const edit = $('[data-action="edit"]', els.results);
    if (edit) edit.addEventListener('click', () => openManual(lastItem, '✏️ 상품 제목·가격·본문을 수정하면 <b>즉시 다시 분석</b>합니다.'));

    // 진단 결과 리포트 인쇄/PDF 저장 버튼 바인딩
    const printBtn = $('[data-action="print-report"]', els.results);
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        window.print();
      });
    }

    // 대시보드 내 상태 등급(미개봉/S급, A급, B급) 클릭 전환
    $$('[data-rt-grade]', els.results).forEach((btn) => {
      btn.addEventListener('click', () => updateConditionGradeInstant(btn.dataset.rtGrade));
    });

    // 대시보드 내 실시간 시세 모델명 재검색 폼
    const dashMarketForm = $('#dashMarketSearchForm', els.results);
    const dashMarketInput = $('#dashMarketQueryInput', els.results);
    if (dashMarketForm && dashMarketInput) {
      dashMarketForm.addEventListener('submit', (e) => {
        e.preventDefault();
        runMarketLookup(dashMarketInput.value);
      });
    }

    // 인라인 가격 클릭/수정 바인딩
    const inlineWrap = $('[data-role="inline-price"]', els.results);
    const toggleInlineBtn = $$('[data-action="toggle-price-edit"]', els.results);
    const inlineForm = $('#inlinePriceForm', els.results);
    const inlineInput = $('#inlinePriceInput', els.results);
    const inlineCancel = $('[data-action="cancel-price-edit"]', els.results);

    toggleInlineBtn.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!inlineWrap) return;
        inlineWrap.classList.add('editing');
        if (inlineInput) {
          inlineInput.value = it.price != null ? it.price.toLocaleString('ko-KR') : '';
          inlineInput.focus();
          inlineInput.select();
        }
      });
    });
    if (inlineCancel && inlineWrap) {
      inlineCancel.addEventListener('click', () => inlineWrap.classList.remove('editing'));
    }
    if (inlineForm && inlineInput) {
      inlineForm.addEventListener('submit', (e) => {
        e.preventDefault();
        updatePriceInstant(inlineInput.value);
      });
    }
    $$('[data-price-pick]', els.results).forEach((chip) => {
      chip.addEventListener('click', () => updatePriceInstant(Number(chip.dataset.pricePick)));
    });

    const defaultQuestions = buildCustomCounterQuestions(r);
    $$('[data-action="copy"]', els.results).forEach((copyBtn) => {
      copyBtn.addEventListener('click', async () => {
        const targetVal = $('#scriptText', els.results) ? $('#scriptText', els.results).value : defaultQuestions.fullText;
        const ok = await copyText(targetVal);
        toast(
          ok ? '채팅방에 바로 붙여넣을 수 있도록 복사되었습니다' : '복사에 실패했어요. 직접 선택해 복사해 주세요',
          ok ? 'ok' : 'warn'
        );
        if (ok) {
          $$('[data-action="copy"]', els.results).forEach((b) => b.classList.add('done'));
          setTimeout(() => $$('[data-action="copy"]', els.results).forEach((b) => b.classList.remove('done')), 1800);
        }
      });
    });
    const reset = $('[data-action="reset-script"]', els.results);
    if (reset) {
      reset.addEventListener('click', () => {
        if ($('#scriptText', els.results)) $('#scriptText', els.results).value = defaultQuestions.fullText;
        toast('맞춤형 역질문 기본 멘트로 되돌렸어요');
      });
    }

    /* ----- 🎛️ 실시간 가격 네고 슬라이더 및 프리셋 바인딩 ----- */
    const negoSlider = $('#priceNegoSlider', els.results);
    const sliderValText = $('#simSliderValText', els.results);
    const sliderDiffBadge = $('#simSliderDiffBadge', els.results);

    if (negoSlider) {
      negoSlider.addEventListener('input', () => {
        const val = Number(negoSlider.value);
        if (!Number.isFinite(val) || val <= 0) return;

        lastItem.price = val;
        lastItem.officialPrice = true;
        const updatedR = SD.analyze(lastItem);

        // 1) 슬라이더 상단 값 & 차액 배지 실시간 동기화
        if (sliderValText) sliderValText.textContent = SD.won(val);
        if (sliderDiffBadge && updatedR.priceInfo && updatedR.priceInfo.expectedPrice) {
          const exp = updatedR.priceInfo.expectedPrice;
          const diffW = val - exp;
          const diffP = Math.round((diffW / exp) * 100);
          let badgeText = '';
          let badgeCls = 'good';
          if (diffW === 0) {
            badgeText = '적정가와 일치 (0%)';
            badgeCls = 'good';
          } else if (diffW < 0) {
            badgeText = `적정가 대비 -${Math.abs(diffP)}% (${SD.won(Math.abs(diffW))} 저렴)`;
            badgeCls = diffP <= -45 ? 'bad' : (diffP <= -25 ? 'warn' : 'good');
          } else {
            badgeText = `적정가 대비 +${diffP}% (${SD.won(diffW)} 비쌈)`;
            badgeCls = diffP >= 20 ? 'over' : 'good';
          }
          sliderDiffBadge.textContent = badgeText;
          sliderDiffBadge.className = `sim-cur-diff sim-diff-${badgeCls}`;
        }

        // 2) 종합 위험도 게이지 바늘 · 숫자 · 레벨 배지 실시간 연동
        const gaugeNeedle = $('.g-needle', els.results);
        const gaugeNum = $('.gauge-num', els.results);
        const gaugeLabel = $('.gauge-label', els.results);
        const lvPill = $('.gauge-card .lv-pill', els.results);
        const gaugeProg = $('.g-progress', els.results);
        const rot = (updatedR.score / 100) * 180 - 90;
        if (gaugeNeedle) gaugeNeedle.setAttribute('transform', `rotate(${rot.toFixed(1)} 160 160)`);
        if (gaugeNum) gaugeNum.textContent = updatedR.score;
        if (gaugeLabel) gaugeLabel.textContent = updatedR.level.label;
        if (lvPill) lvPill.textContent = updatedR.level.label;
        if (gaugeProg) {
          const totalLen = Math.PI * 120;
          gaugeProg.style.strokeDashoffset = (totalLen * (1 - updatedR.score / 100)).toFixed(1);
        }
        els.results.className = 'results animate lv-' + updatedR.level.key;

        // 3) 상단 상품 카드 가격 동기화
        const prodPriceSpan = $('.product-price span', els.results);
        const prodPriceSmall = $('.product-price small', els.results);
        if (prodPriceSpan) prodPriceSpan.textContent = SD.won(val);
        if (prodPriceSmall) prodPriceSmall.textContent = SD.manwon(val);

        // 4) 시세 카드 비교 배너 및 가격 트랙 핀 동기화
        const cmpValB = $('.fixed-compare-banner .cmp-item b', els.results);
        if (cmpValB) {
          cmpValB.innerHTML = `${SD.won(val)} <small>(${SD.manwon(val)})</small>`;
        }
        const cmpDiffB = $('.fixed-compare-banner .cmp-diff b', els.results);
        if (cmpDiffB && updatedR.priceInfo) {
          const diffW = updatedR.priceInfo.diffWon;
          const diffP = updatedR.priceInfo.diffPct;
          let diffStr;
          if (diffW === 0) diffStr = '0원 차이 (0% · 적정 시세와 일치)';
          else if (diffW < 0) diffStr = `-${SD.won(Math.abs(diffW))} (${diffP}% 저렴)`;
          else diffStr = `+${SD.won(diffW)} (+${diffP}% 비쌈)`;
          cmpDiffB.textContent = diffStr;
        }

        const pin = $('.price-track .pin', els.results);
        if (pin && updatedR.priceInfo && updatedR.priceInfo.market) {
          const m = updatedR.priceInfo.market;
          const maxV = Math.max(m.high * 1.45, val * 1.15);
          const pinPos = Math.max(8, Math.min(92, (val / maxV) * 100)).toFixed(2);
          pin.style.setProperty('--x', `${pinPos}%`);
          const pinSpan = $('span', pin);
          if (pinSpan) pinSpan.textContent = `판매가 ${SD.manwon(val)}`;
        }
      });

      negoSlider.addEventListener('change', () => {
        const val = Number(negoSlider.value);
        if (Number.isFinite(val) && val > 0) {
          updatePriceInstant(val, { preserveScroll: true, fromSlider: true });
        }
      });
    }

    // 퀵 네고 프리셋 버튼 바인딩
    $$('.sim-preset-btn', els.results).forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!lastItem) return;
        const currentP = lastItem.price || (r.priceInfo && r.priceInfo.expectedPrice) || 500000;
        const expectedP = (r.priceInfo && r.priceInfo.expectedPrice) || currentP;
        const action = btn.dataset.nego;
        let target = currentP;

        if (action === '-10') {
          target = Math.max(10000, Math.round((currentP * 0.9) / 10000) * 10000);
        } else if (action === '-50000') {
          target = Math.max(10000, currentP - 50000);
        } else if (action === 'fair') {
          target = expectedP;
        } else if (action === '+50000') {
          target = currentP + 50000;
        } else if (action === 'reset') {
          target = originalItemPrice || currentP;
        }

        updatePriceInstant(target, { preserveScroll: true });
      });
    });

    /* ----- 📊 기준 시세 직접 입력 폼 및 복원 버튼 바인딩 ----- */
    const simMarketForm = $('#simCustomMarketForm', els.results);
    const simMarketInput = $('#simCustomMarketInput', els.results);
    const simResetMarketBtn = $('#simResetMarketBtn', els.results);

    if (simMarketForm && simMarketInput) {
      simMarketForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const raw = simMarketInput.value.trim();
        const customP = SD.normalizePrice(raw);
        if (customP == null || customP < 10000) {
          toast('유효한 기준 시세를 입력해 주세요 (예: 75만원 또는 750000)', 'warn');
          simMarketInput.focus();
          return;
        }

        const curMarket = (r.priceInfo && r.priceInfo.market) || SD.getInstantMarketStats(lastItem.marketQuery || lastItem.title || '스마트폰');
        const customMarket = Object.assign({}, curMarket, {
          avg: customP,
          aGrade: customP,
          unopened: Math.round((customP * 1.25) / 10000) * 10000,
          sGrade: Math.round((customP * 1.10) / 10000) * 10000,
          bGrade: Math.round((customP * 0.80) / 10000) * 10000,
          low: Math.round(customP * 0.75),
          high: Math.round(customP * 1.25),
          gradePrices: {
            '미개봉': Math.round((customP * 1.25) / 10000) * 10000,
            'S급': Math.round((customP * 1.10) / 10000) * 10000,
            'A급': customP,
            'B급': Math.round((customP * 0.80) / 10000) * 10000
          },
          isCustom: true
        });

        lastItem.realtimeMarket = customMarket;
        lastMarketStats = customMarket;
        render(SD.analyze(lastItem), { preserveScroll: true });
        toast(`📊 기준 시세를 ${SD.won(customP)}(${SD.manwon(customP)})으로 직접 설정하여 위험도를 재계산했어요!`);
      });
    }

    if (simResetMarketBtn) {
      simResetMarketBtn.addEventListener('click', () => {
        if (!lastItem) return;
        const q = lastItem.marketQuery || lastItem.title || '스마트폰';
        const defaultMarket = SD.getInstantMarketStats(q, lastItem.price);
        lastItem.realtimeMarket = defaultMarket;
        lastMarketStats = defaultMarket;
        render(SD.analyze(lastItem), { preserveScroll: true });
        toast('2026년 11월 공식 기준 시세로 복원했어요!');
      });
    }

    /* ----- ✅ 구매 전 안전 체크리스트 바인딩 ----- */
    function syncChecklistUI() {
      const cnt = safetyChecklistState.filter(Boolean).length;
      const pct = Math.round((cnt / 4) * 100);
      const isDone = cnt === 4;

      const fill = $('#chkProgressFill', els.results);
      const text = $('#chkProgressText', els.results);
      const countEl = $('#chkProgressCount', els.results);
      const banner = $('#chkDoneBanner', els.results);
      const toggleBtn = $('#chkToggleAllBtn', els.results);

      if (fill) {
        fill.style.width = `${pct}%`;
        fill.classList.toggle('complete', isDone);
      }
      if (text) text.textContent = `${pct}%`;
      if (countEl) countEl.textContent = `${cnt} / 4 완료`;
      if (banner) banner.classList.toggle('show', isDone);
      if (toggleBtn) toggleBtn.textContent = isDone ? '전체 해제' : '모두 완료';

      $$('.chk-item', els.results).forEach((item, i) => {
        item.classList.toggle('checked', Boolean(safetyChecklistState[i]));
      });
    }

    $$('[data-chk-input]', els.results).forEach((input) => {
      input.addEventListener('change', () => {
        const idx = Number(input.dataset.chkInput);
        safetyChecklistState[idx] = input.checked;
        syncChecklistUI();
      });
    });

    const chkToggleAllBtn = $('#chkToggleAllBtn', els.results);
    if (chkToggleAllBtn) {
      chkToggleAllBtn.addEventListener('click', () => {
        const allChecked = safetyChecklistState.every(Boolean);
        const nextState = !allChecked;
        safetyChecklistState = [nextState, nextState, nextState, nextState];
        $$('[data-chk-input]', els.results).forEach((inp) => { inp.checked = nextState; });
        syncChecklistUI();
        toast(nextState ? '모든 안전 수칙 체크를 완료했습니다!' : '체크리스트를 초기화했습니다');
      });
    }

    requestAnimationFrame(() => requestAnimationFrame(() => {
      els.results.classList.add('animate');
      countUp($('.gauge-num', els.results), r.score);
    }));

    if (!renderOpts.preserveScroll) {
      setTimeout(() => {
        els.results.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      }, 120);
    }
  }

  function countUp(el, to) {
    if (!el) return;
    if (reduceMotion) { el.textContent = to; return; }
    const dur = 1100;
    const t0 = performance.now();
    const stepFn = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(stepFn);
    };
    requestAnimationFrame(stepFn);
  }

  /* ----- 상품 카드 (인라인 가격 클릭 수정 + 외부 교차 검증 및 도용 확인 퀵 링크 3종) ----- */
  function renderProduct(r) {
    const it = r.item;
    const desc = it.description || '';
    const tags = [];
    if (r.deviceInfo) tags.push(`<span class="tag">${CAT_ICON[r.deviceInfo.family] || '📱'} ${esc(r.deviceInfo.name)}</span>`);
    if (r.priceInfo && r.priceInfo.market) tags.push(`<span class="tag">🔎 시세기준: ${esc(r.priceInfo.market.query)}</span>`);
    if (r.storage) tags.push(`<span class="tag">💾 ${SD.formatStorage(r.storage)}</span>`);
    if (!r.banned) {
      const condBadge = r.condition.badgeText || (r.condition.grade === 'B급' ? 'B급 (사용감 있음)' : r.condition.grade);
      tags.push(`<span class="tag tag-cond cond-${esc(r.condition.grade)}">✨ ${esc(condBadge)}</span>`);
    } else {
      tags.push('<span class="tag tag-danger">거래 금지</span>');
    }
    const priceText = it.price != null ? SD.won(it.price) : '가격 입력하기';

    const allCands = SD.parsePriceCandidates ? SD.parsePriceCandidates((it.title || '') + '\n' + desc) : [];
    const seenVals = new Set();
    const uniqueCands = allCands.filter((c) => {
      if (seenVals.has(c.value)) return false;
      seenVals.add(c.value);
      return true;
    }).slice(0, 4);
    const candChips = uniqueCands.length > 1
      ? `<div class="price-cands"><span class="cand-label">본문 내 감지된 금액 클릭 전환:</span>${uniqueCands.map((c) =>
          `<button type="button" class="cand-chip ${c.value === it.price ? 'active' : ''} ${c.ignored ? 'ignored' : ''}" data-price-pick="${c.value}" title="${c.ignored ? '비교 가격(업자/출고가 등)으로 자동 제외된 금액 — 클릭 시 이 금액으로 변경' : '클릭 시 이 금액으로 즉시 재계산'}">${SD.manwon(c.value)}${c.ignored ? ' <small>(비교가 제외됨)</small>' : ''}</button>`
        ).join('')}</div>`
      : '';

    // 외부 교차 검증 및 도용 확인 퀵 링크 URL 생성
    const hasHttpImage = Boolean(it.image && /^https?:\/\//i.test(it.image));
    const searchKeyword = (
      (r.priceInfo && r.priceInfo.market && r.priceInfo.market.query) ||
      SD.extractSearchQuery(it.title || '') ||
      it.title ||
      '중고 매물'
    ).trim();
    const googleLensUrl = hasHttpImage
      ? `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(it.image)}`
      : `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(searchKeyword + ' 실사')}`;
    const naverShoppingUrl = `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(searchKeyword)}`;
    const policeCyberUrl = 'https://ecrm.police.go.kr/minwon/main';

    return `
      <article class="card product">
        <div class="product-thumb">
          <img src="${esc(safeImg(it.image))}" alt="${esc(it.title || '상품 이미지')}" referrerpolicy="no-referrer" decoding="async">
          <span class="platform-badge ${PLATFORM_CLASS[it.platform] || 'pf-other'}">${esc(it.platformName || '스마트 입력')}</span>
          ${it.demo ? '<span class="demo-badge">시연용 샘플</span>' : ''}
        </div>
        <div class="product-info">
          <div class="card-kicker">추출된 상품 정보</div>
          <h2 class="product-title">${esc(it.title || '(제목 없음)')}</h2>
          <div class="inline-price-wrap" data-role="inline-price">
            <div class="product-price-row">
              <button type="button" class="product-price price-edit-trigger" data-action="toggle-price-edit" title="클릭하여 판매 가격 즉시 수정">
                <span>${priceText}</span>
                ${it.price != null ? `<small>${SD.manwon(it.price)}</small>` : ''}
                <span class="inline-edit-badge no-print">✏️ 가격 클릭 수정</span>
              </button>
            </div>
            <form id="inlinePriceForm" class="inline-price-form no-print" novalidate>
              <input id="inlinePriceInput" type="text" inputmode="numeric" placeholder="예: 850000 또는 85만원" aria-label="판매 가격 수정">
              <button type="submit" class="btn-primary btn-sm">즉시 재계산</button>
              <button type="button" class="btn-ghost btn-sm" data-action="cancel-price-edit">취소</button>
            </form>
            ${candChips}
          </div>
          <div class="tag-row">${tags.join('')}</div>
          ${desc ? `<p class="product-desc">${esc(desc)}</p>` : '<p class="product-desc muted">본문 설명이 비어 있어요. 전체 정보 수정에서 본문을 붙여넣으면 키워드 분석이 더 정확해집니다.</p>'}
          <div class="product-meta">
            ${it.seller ? `<span>👤 ${esc(it.seller)}</span>` : ''}
            <span>🔎 출처: ${esc((it.sources && it.sources.length ? it.sources : ['스마트 입력']).join(' → '))}</span>
            ${it.url && /^https?:/i.test(it.url) && !it.demo ? `<a href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">원문 보기 ↗</a>` : ''}
          </div>
          <div class="verify-chips-section no-print">
            <div class="verify-chips-label">🔍 외부 교차 검증 및 도용 확인 퀵 링크</div>
            <div class="verify-chips-bar">
              <a class="verify-chip" href="${esc(googleLensUrl)}" target="_blank" rel="noopener noreferrer" title="추출된 상품 이미지로 구글 렌즈 사진 도용 여부를 즉시 검색합니다">
                📷 구글 렌즈로 사진 도용 검색
              </a>
              <a class="verify-chip" href="${esc(naverShoppingUrl)}" target="_blank" rel="noopener noreferrer" title="추출된 상품명으로 네이버 쇼핑 시세를 새 탭에서 비교합니다">
                📊 네이버 쇼핑 시세 비교
              </a>
              <a class="verify-chip" href="${esc(policeCyberUrl)}" target="_blank" rel="noopener noreferrer" title="경찰청 사이버안전지킴이 사기 전화·계좌번호 조회 페이지로 연결합니다">
                🛡️ 경찰청 사이버사기 조회
              </a>
            </div>
          </div>
          <button type="button" class="btn-ghost no-print" data-action="edit">📝 전체 정보 수정</button>
        </div>
      </article>`;
  }

  /* ----- 위험도 게이지 (Google 공식 컬러 시스템 적용) ----- */
  const G = { cx: 160, cy: 160, r: 120 };
  function gp(v, r = G.r) {
    const th = Math.PI - (v / 100) * Math.PI;
    return [G.cx + r * Math.cos(th), G.cy - r * Math.sin(th)];
  }
  function arc(v0, v1, r = G.r) {
    const [x0, y0] = gp(v0, r);
    const [x1, y1] = gp(v1, r);
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }

  function renderGauge(r) {
    const segs = [[0, 25, 'safe'], [25, 50, 'caution'], [50, 80, 'danger'], [80, 100, 'fraud']];
    const len = Math.PI * G.r;
    const ticks = [0, 25, 50, 80, 100].map((v) => {
      const [x, y] = gp(v, G.r + 24);
      return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" class="g-tick">${v}</text>`;
    }).join('');
    const rot = (r.score / 100) * 180 - 90;
    const googleMapColor = { safe: '#1E8E3E', caution: '#F9AB00', danger: '#D93025', fraud: '#D93025' };
    const levels = SD.LEVELS.map((l) => {
      const active = r.level.key === l.key || (r.level.key === 'banned' && l.key === 'fraud');
      const col = googleMapColor[l.key] || l.color;
      return `<li class="${active ? 'active' : ''}" style="--c:${col}"><i></i><b>${l.label}</b><span>${l.min}~${l.key === 'fraud' ? 100 : SD.LEVELS[SD.LEVELS.indexOf(l) + 1].min - 1}</span></li>`;
    }).join('');

    return `
      <article class="card gauge-card">
        <div class="card-head"><h3>종합 위험도</h3><span class="lv-pill">${esc(r.level.label)}</span></div>
        <div class="gauge-wrap">
          <svg class="gauge" viewBox="0 0 320 185" role="img" aria-label="위험도 ${r.score}점, ${esc(r.level.label)}">
            <defs>
              <linearGradient id="gGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stop-color="#1E8E3E"/><stop offset=".38" stop-color="#F9AB00"/>
                <stop offset=".7" stop-color="#D93025"/><stop offset="1" stop-color="#D93025"/>
              </linearGradient>
            </defs>
            ${segs.map(([a, b, k]) => `<path d="${arc(a + 0.6, b - 0.6)}" class="g-seg seg-${k}"/>`).join('')}
            <path d="${arc(0, 100)}" class="g-progress" stroke="url(#gGrad)"
              style="stroke-dasharray:${len.toFixed(1)};--off-start:${len.toFixed(1)};--off-end:${(len * (1 - r.score / 100)).toFixed(1)}"/>
            ${ticks}
            <g class="g-needle" transform="rotate(${rot.toFixed(1)} ${G.cx} ${G.cy})">
              <line x1="${G.cx}" y1="${G.cy - 68}" x2="${G.cx}" y2="${G.cy - G.r + 12}"/>
              <circle cx="${G.cx}" cy="${G.cy - 68}" r="4.5"/>
            </g>
          </svg>
          <div class="gauge-center">
            <div class="gauge-score"><span class="gauge-num">${r.score}</span><span class="gauge-unit">/100</span></div>
            <div class="gauge-label">${esc(r.level.label)}</div>
          </div>
        </div>
        <p class="gauge-sub">${esc(r.level.sub)}</p>
        <p class="summary">${esc(r.summary)}</p>
        <ul class="level-scale">${levels}</ul>
      </article>`;
  }

  /* ----- 실시간 인터넷 중고 시세 분석 & 예상 적정가 계산기 ----- */
  function renderPrice(r) {
    const it = r.item;
    let body;

    if (r.banned) {
      body = `<div class="empty-state danger"><div class="empty-icon">⛔</div><p><b>시세 계산 중단</b><br>거래 금지 품목은 적정 시세를 산정하지 않습니다.</p></div>`;
    } else {
      const m = (r.priceInfo && r.priceInfo.market) || SD.getInstantMarketStats(it.marketQuery || it.title || '스마트폰');
      const defaultQuery = m.query || it.marketQuery || SD.extractSearchQuery(it.title || '') || '';

      const quickQueryForm = `
        <form id="dashMarketSearchForm" class="dash-market-form" autocomplete="off" novalidate>
          <input id="dashMarketQueryInput" type="search" value="${esc(defaultQuery)}" placeholder="시세 비교할 모델명 검색 (예: 아이폰 18 Pro, 아이폰 듀오, 갤럭시 S25 울트라)" aria-label="실시간 시세 모델명 검색">
          <button type="submit" class="btn-ghost btn-sm">🔍 시세 즉시 변경</button>
        </form>`;

      const summaryCardHTML = buildRealtimeSummaryCardHTML(m, {
        activeGrade: r.condition.grade,
        interactiveGrade: true,
        listedPrice: it.price
      });

      if (it.price == null) {
        body = `
          ${quickQueryForm}
          ${summaryCardHTML}
          <div class="empty-state"><p>판매가를 아직 입력하지 않았어요. 상단 상품 카드의 <b>✏️ 가격 클릭 수정</b>을 눌러 가격을 입력하면 실시간 시세 대비 차액(원/%)을 즉시 계산합니다.</p></div>`;
      } else if (m.isGeneralItem || (r.priceInfo && r.priceInfo.isGeneralItem)) {
        const generalNote = `일반 중고 물품 (판매가 ${SD.won(it.price)} 기준 · 사기 키워드 및 거래 패턴 중심 분석)`;
        body = `
          ${quickQueryForm}
          ${summaryCardHTML}
          <div class="fixed-compare-banner cmp-good">
            <div class="cmp-item stat-editable" data-action="toggle-price-edit" title="클릭하여 판매자 제시가 수정">
              <span>현재 판매자 제시 가격 ✏️</span>
              <b class="good">${SD.won(it.price)} <small>(${SD.manwon(it.price)})</small></b>
            </div>
            <div class="cmp-vs">VS</div>
            <div class="cmp-item">
              <span>일반 중고 물품 기준가</span>
              <b>${SD.won(it.price)} <small>(판매자 등록가 인정)</small></b>
            </div>
            <div class="cmp-diff">
              <span>시세 괴리 판정</span>
              <b class="good">0점 (정상 기준가 인정)</b>
            </div>
          </div>
          <p class="price-note note-good">✅ ${esc(generalNote)}</p>`;
      } else {
        const expected = r.priceInfo.expectedPrice || m.avg;
        const diffWon = r.priceInfo.diffWon;
        const diffPct = r.priceInfo.diffPct;

        let priceCls = 'good';
        if (r.priceInfo.overpriced) {
          priceCls = 'over';
        } else if (r.cats.price.score >= 30) {
          priceCls = 'bad';
        } else if (r.cats.price.score >= 15) {
          priceCls = 'warn';
        }

        let diffText;
        if (diffWon === 0) {
          diffText = '0원 차이 (0% · 적정 시세와 일치)';
        } else if (diffWon < 0) {
          diffText = `-${SD.won(Math.abs(diffWon))} (${diffPct}% 저렴)`;
        } else {
          diffText = `+${SD.won(diffWon)} (+${diffPct}% 비쌈)`;
        }

        const gradeLabel = r.condition.grade === 'A급' ? '중고 평균(A급)' : r.condition.grade;
        const compareBanner = `
          <div class="fixed-compare-banner cmp-${priceCls}">
            <div class="cmp-item stat-editable" data-action="toggle-price-edit" title="클릭하여 판매자 제시가 수정">
              <span>현재 판매자 제시 가격 ✏️</span>
              <b class="${priceCls}">${SD.won(it.price)} <small>(${SD.manwon(it.price)})</small></b>
            </div>
            <div class="cmp-vs">VS</div>
            <div class="cmp-item">
              <span>${esc(gradeLabel)} 예상 적정가</span>
              <b>${SD.won(expected)} <small>(${SD.manwon(expected)})</small></b>
            </div>
            <div class="cmp-diff">
              <span>적정 시세 대비 차이 (원 / %)</span>
              <b class="${priceCls}">${diffText}</b>
            </div>
          </div>`;

        const maxV = Math.max(m.high * 1.45, it.price * 1.15);
        const posNum = (v) => Math.max(0, Math.min(100, (v / maxV) * 100));
        const pos = (v) => posNum(v).toFixed(2);

        const wBait = posNum(expected * 0.55);
        const wLow = Math.max(0, posNum(m.low) - wBait);
        const wFair = Math.max(0, posNum(m.high) - posNum(m.low));
        const wOver = Math.max(0, 100 - posNum(m.high));
        const pinPos = Math.max(8, Math.min(92, posNum(it.price))).toFixed(2);
        const noteIcon = priceCls === 'good' ? '✅' : priceCls === 'over' ? '🟠' : priceCls === 'warn' ? '⚠️' : '🚩';

        body = `
          ${quickQueryForm}
          ${summaryCardHTML}
          ${compareBanner}
          <div class="price-track" aria-hidden="true">
            <div class="zone zone-bait" style="left:0;width:${wBait.toFixed(2)}%">${wBait >= 11 ? '<em>미끼 의심</em>' : ''}</div>
            <div class="zone zone-low" style="left:${wBait.toFixed(2)}%;width:${wLow.toFixed(2)}%">${wLow >= 11 ? '<em>급처·꿀매</em>' : ''}</div>
            <div class="zone zone-fair" style="left:${pos(m.low)}%;width:${wFair.toFixed(2)}%">${wFair >= 9 ? '<em>B급~미개봉 적정가</em>' : ''}</div>
            <div class="zone zone-over" style="left:${pos(m.high)}%;width:${wOver.toFixed(2)}%">${wOver >= 12 ? '<em>과대 책정</em>' : ''}</div>
            <div class="tick-avg" style="left:${pos(expected)}%"><span>${esc(gradeLabel)} 적정가 ${SD.manwon(expected)}</span></div>
            <div class="pin pin-${priceCls}" style="--x:${pinPos}%"><span>판매가 ${SD.manwon(it.price)}</span></div>
          </div>
          <p class="price-note note-${priceCls}">${noteIcon} ${esc(r.priceInfo.note)}</p>`;
      }
      body += buildSimulatorHTML(r, m) + buildExternalMarketHubHTML(defaultQuery, it.image || null);
    }

    return `
      <article class="card price-card">
        <div class="card-head">
          <div class="card-title-row">
            <h3>📊 실시간 중고 시세 & 예상 적정가 판독</h3>
            <span class="rt-live-badge">LIVE · 사분위 절사평균</span>
          </div>
          <span class="card-hint">2026년 11월 최신 기종 포함 0.1초 즉시 비교</span>
        </div>
        ${body}
      </article>`;
  }

  /* ----- 항목별 분석 (레이더 + 막대) ----- */
  function renderBreakdown(r) {
    const cats = SD.RISK_CATEGORIES;
    const vals = cats.map((c) => (r.banned ? 1 : r.cats[c.id].score / c.max));
    const R = 68, cx = 152, cy = 120;
    const pt = (i, k) => {
      const a = (-90 + i * (360 / cats.length)) * Math.PI / 180;
      return [cx + R * k * Math.cos(a), cy + R * k * Math.sin(a)];
    };
    const grid = [0.25, 0.5, 0.75, 1].map((k) =>
      `<polygon class="r-grid" points="${cats.map((_, i) => pt(i, k).map((n) => n.toFixed(1)).join(',')).join(' ')}"/>`).join('');
    const axes = cats.map((_, i) => { const [x, y] = pt(i, 1); return `<line class="r-axis" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join('');
    const labels = cats.map((c, i) => {
      const isTopOrBottom = i === 0 || i === 3;
      const dist = isTopOrBottom ? 1.25 : 1.22;
      const [x, y] = pt(i, dist);
      return `<text class="r-label" x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}">${c.label}</text>`;
    }).join('');
    const poly = cats.map((_, i) => pt(i, Math.max(0.05, vals[i])).map((n) => n.toFixed(1)).join(',')).join(' ');
    const dots = cats.map((_, i) => { const [x, y] = pt(i, Math.max(0.05, vals[i])); return `<circle class="r-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5"/>`; }).join('');

    let bars;
    if (r.banned) {
      bars = `<li class="bar-row hot"><div class="bar-top"><span>🚫 이상 품목 필터</span><b>100 / 100</b></div><div class="bar"><i style="--w:100%"></i></div><small>${esc(r.banned.rule.title)} — 시세·키워드 점수 계산 생략</small></li>`;
    } else {
      bars = cats.map((c) => {
        const s = r.cats[c.id].score;
        const pct = (s / c.max) * 100;
        const hitLabels = [...new Set(r.cats[c.id].hits.map((h) => h.label))];
        let sub;
        let isSafeZero = false;
        if (c.id === 'price') {
          if (r.priceInfo && r.priceInfo.isGeneralItem && r.item.price != null) {
            sub = `일반 중고 물품 (판매가 ${SD.won(r.item.price)} 기준 · 사기 키워드 및 거래 패턴 중심 분석)`;
            isSafeZero = true;
          } else if (r.priceInfo && r.priceInfo.ratio != null) {
            if (s <= 15) {
              sub = '중고 평균 시세 대비 적정 범위 (정상 매물)';
              isSafeZero = true;
            } else if (r.priceInfo.overpriced) {
              sub = `중고 평균 시세 대비 ${Math.round(r.priceInfo.ratio * 100)}% 가격 (과대 책정 주의)`;
            } else {
              sub = `중고 평균 시세 대비 ${Math.round(r.priceInfo.ratio * 100)}% 가격 (저가 미끼 주의)`;
            }
          } else {
            sub = '판매가 입력 시 즉시 비교';
          }
        } else if (hitLabels.length && s > 0) {
          sub = hitLabels.join(' · ');
        } else {
          sub = '✓ 위험 패턴 없음 (안전)';
          isSafeZero = true;
        }
        return `<li class="bar-row ${s ? 'hot' : 'safe-zero'}"><div class="bar-top"><span>${c.icon} ${c.label}</span><b>${s} / ${c.max}</b></div><div class="bar"><i style="--w:${pct}%"></i></div><small class="${isSafeZero ? 'sub-safe' : ''}">${esc(sub)}</small></li>`;
      }).join('');
    }

    return `
      <article class="card breakdown-card">
        <div class="card-head"><h3>항목별 위험 분석</h3><span class="card-hint">항목 합산 · 최대 100점</span></div>
        <div class="breakdown">
          <div class="radar-wrap">
            <svg class="radar" viewBox="0 0 304 240" role="img" aria-label="항목별 위험 레이더 차트">
              ${grid}${axes}
              <polygon class="r-area" points="${poly}"/>
              ${dots}${labels}
            </svg>
          </div>
          <ul class="bars">${bars}</ul>
        </div>
      </article>`;
  }

  /* ----- 키워드 하이라이트 ----- */
  function renderKeywords(r) {
    const it = r.item;
    const full = (it.title || '') + '\n' + (it.description || '');
    const groups = {};
    r.hits.forEach((h) => { (groups[h.label] = groups[h.label] || { cat: h.cat, words: new Set() }).words.add(h.text.trim()); });
    const chips = Object.entries(groups).map(([label, g]) =>
      `<li class="kw kw-${g.cat}"><b>${esc(label)}</b><span>${[...g.words].slice(0, 4).map(esc).join(', ')}</span></li>`).join('');
    return `
      <article class="card kw-card">
        <div class="card-head"><h3>위험 키워드 감지</h3><span class="count-pill ${r.hits.length ? 'hot' : ''}">${r.hits.length}건</span></div>
        ${r.hits.length ? `<ul class="kw-list">${chips}</ul>` : '<div class="empty-state ok"><div class="empty-icon">🛡️</div><p>외부링크 · 카톡 유도 · 수고비 · 선입금 · 직거래 회피 등<br><b>위험 키워드가 발견되지 않았어요.</b></p></div>'}
        <div class="hl-box" tabindex="0" aria-label="키워드가 표시된 원문">${SD.highlight(full, r.hits).replace(/\n/g, '<br>')}</div>
        <div class="legend">
          <span class="lg lg-phishing">피싱·외부링크</span><span class="lg lg-prepay">선입금·수수료</span>
          <span class="lg lg-messenger">메신저</span><span class="lg lg-direct">직거래 회피</span>
          <span class="lg lg-pressure">압박</span><span class="lg lg-banned">금지 품목</span>
        </div>
      </article>`;
  }

  /* ----- 조언 ----- */
  function renderTips(r) {
    return `
      <article class="card tips-card">
        <div class="card-head"><h3>${r.banned ? '지금 바로 해야 할 일' : '거래 전 체크리스트'}</h3><span class="card-hint">${r.deviceInfo ? esc(r.deviceInfo.name) + ' 맞춤' : '일반 수칙'}</span></div>
        <ol class="tips">${r.tips.map((t) => `<li>${t}</li>`).join('')}</ol>
        <div class="link-row">
          <a href="https://thecheat.co.kr" target="_blank" rel="noopener noreferrer">🔍 더치트 사기 조회</a>
          <a href="https://ecrm.police.go.kr" target="_blank" rel="noopener noreferrer">🚓 사이버범죄 신고</a>
        </div>
      </article>`;
  }

  /* ----- 사기꾼 판별용 맞춤형 역질문 생성기 (원클릭 복사) ----- */
  function buildCustomCounterQuestions(r) {
    if (r.banned) {
      return {
        items: [
          {
            badge: '법적 거래 금지 품목',
            text: '1. 해당 물품은 현행법상 개인 간 중고거래가 금지된 품목(의약품·도수렌즈 등)으로 확인되어 거래를 진행하지 않겠습니다.'
          },
          {
            badge: '신상 협박·갈취 예방',
            text: '2. 불법 거래를 빌미로 한 추가 입금 요구나 협박 시 경찰청 사이버범죄 신고시스템(ecrm.police.go.kr)에 즉시 접수하겠습니다.'
          }
        ],
        fullText: r.script
      };
    }

    const it = r.item || {};
    const titleAndDesc = `${it.title || ''} ${it.description || ''}`;
    const isSmartphone = Boolean(
      r.deviceInfo ||
      /(?:아이폰|iphone|갤럭시|galaxy|폴드|fold|플립|flip|울트라|ultra)/i.test(titleAndDesc)
    );
    const hasRiskOrPriceGap = Boolean(
      (r.hits && r.hits.length > 0) ||
      (r.cats && r.cats.price && r.cats.price.score > 0) ||
      r.score >= 15
    );
    const isBGradeOrUsed = Boolean(r.condition && (r.condition.grade === 'B급' || r.condition.grade === 'A급'));

    const questions = [
      {
        badge: '실물·도용 사진 판별',
        text: '1. 도용 사진 방지를 위해 물건 옆에 오늘 날짜와 닉네임 메모를 두고 찍은 사진 요청 가능할까요?'
      },
      {
        badge: '안전결제 회피 여부 확인',
        text: '2. 수수료는 제가 부담할 테니 번개페이(안전결제)로 바로 결제해도 될까요?'
      }
    ];

    if (isSmartphone) {
      questions.push({
        badge: '스마트폰 배터리·정상해지 검증',
        text: '3. 설정 > 정보 화면의 배터리 성능 수치와 수리 내역 유무, 정상 해지(선택약정 가능) 여부 확인 부탁드립니다.'
      });
    } else if (isBGradeOrUsed) {
      questions.push({
        badge: `${r.condition.grade} 실사용 상태 검증`,
        text: '3. 실사용 기간과 외관 상처·기능 이상 유무를 근접 사진으로 한 번만 더 확인 부탁드립니다.'
      });
    }

    const nextIdx = questions.length + 1;
    questions.push({
      badge: hasRiskOrPriceGap ? '위험 키워드·저가 매물 직거래 검증' : '직거래 가능 여부 최종 확인',
      text: `${nextIdx}. 직거래 가능한 정확한 역/장소와 시간대를 먼저 알려주실 수 있나요?`
    });

    const fullText = questions.map((q) => q.text).join('\n');
    return { items: questions, fullText };
  }

  function renderScript(r) {
    const qData = buildCustomCounterQuestions(r);
    const questionCardsHtml = qData.items.map((q) => `
      <li class="counter-q-item">
        <span class="counter-q-badge">${esc(q.badge)}</span>
        <p class="counter-q-text">${esc(q.text)}</p>
      </li>`).join('');

    return `
      <article class="card script-card">
        <div class="card-head script-card-head">
          <div class="script-title-wrap">
            <span class="card-kicker">💬 사기꾼 판별용 맞춤형 역질문 생성기</span>
            <h3>${r.banned ? '🛑 거래 금지 품목 거절 · 차단 멘트' : '판매자에게 보낼 안전 확인 질문'}</h3>
            <span class="card-hint">${r.banned ? '대화를 끝낼 때 그대로 복사해 보내세요' : '매물 상태·시세 괴리·기종에 맞춰 자동 생성된 핵심 질문입니다 · 채팅방에 바로 붙여넣으세요'}</span>
          </div>
          <div class="script-head-actions no-print">
            <button type="button" class="btn-primary btn-google-copy" data-action="copy">
              <span class="copy-label">📋 질문 전체 복사하기</span>
              <span class="copied-label">✅ 복사 완료!</span>
            </button>
          </div>
        </div>
        <ul class="counter-q-list">${questionCardsHtml}</ul>
        <label for="scriptText" class="script-edit-label">원클릭 복사용 전체 메시지 (직접 수정 가능)</label>
        <textarea id="scriptText" class="script-text" rows="${Math.max(4, qData.items.length + 1)}" spellcheck="false" aria-label="판매자에게 보낼 안전 확인 질문">${esc(qData.fullText)}</textarea>
        <div class="script-actions no-print">
          <button type="button" class="btn-ghost" data-action="reset-script">↺ 기본 질문으로 초기화</button>
          <button type="button" class="btn-primary" data-action="copy">
            <span class="copy-label">📋 질문 전체 복사하기</span>
            <span class="copied-label">✅ 복사 완료!</span>
          </button>
        </div>
      </article>`;
  }

  /* =========================== ✅ 구매 전 안전 체크리스트 카드 HTML =========================== */
  const CHECKLIST_DEFS = [
    {
      id: 0,
      title: '구글 렌즈로 사진 도용 여부를 확인했나요?',
      desc: '타 플랫폼이나 인터넷 카페 등에서 퍼온 도용 이미지가 아닌지 교차 검증'
    },
    {
      id: 1,
      title: '번개페이(안전결제) 또는 대면 직거래가 가능한지 확인했나요?',
      desc: '계좌 선입금을 단호히 거절하고 안전결제 승낙 또는 공공장소 직거래 약속'
    },
    {
      id: 2,
      title: '카카오톡·외부 피싱 결제 링크를 클릭하지 않았나요?',
      desc: '앱 밖 카카오톡 대화 유도 및 위조된 안전결제 피싱 링크(URL) 클릭 절대 금지'
    },
    {
      id: 3,
      title: '적정 시세 대비 너무 터무니없이 싸지 않은지 확인했나요?',
      desc: '평균 시세의 50% 미만 극단적 저가 매물은 99% 선입금 유도 사기 패턴'
    }
  ];

  function renderSafetyChecklistCard(r) {
    const checkedCount = safetyChecklistState.filter(Boolean).length;
    const progressPct = Math.round((checkedCount / 4) * 100);
    const isComplete = checkedCount === 4;

    const itemsHtml = CHECKLIST_DEFS.map((def, idx) => {
      const checked = Boolean(safetyChecklistState[idx]);
      return `
        <li class="chk-item ${checked ? 'checked' : ''}" data-chk-idx="${idx}">
          <label class="chk-label">
            <input type="checkbox" class="chk-checkbox" data-chk-input="${idx}" ${checked ? 'checked' : ''}>
            <span class="chk-custom-box" aria-hidden="true">
              <svg viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </span>
            <div class="chk-text-wrap">
              <strong class="chk-item-title">${esc(def.title)}</strong>
              <small class="chk-item-desc">${esc(def.desc)}</small>
            </div>
          </label>
        </li>`;
    }).join('');

    return `
      <article class="card chk-card">
        <div class="card-head chk-card-head">
          <div class="chk-title-wrap">
            <span class="card-kicker">✅ 구매 전 필수 점검</span>
            <h3>구매 전 안전 체크리스트</h3>
            <span class="card-hint">피해 방지를 위해 거래 입금 전 필수 4대 수칙을 점검하세요</span>
          </div>
          <div class="chk-head-actions no-print">
            <button type="button" class="btn-ghost btn-sm" id="chkToggleAllBtn">${isComplete ? '전체 해제' : '모두 완료'}</button>
          </div>
        </div>

        <div class="chk-progress-section">
          <div class="chk-progress-top">
            <span class="chk-progress-title">🛡️ 거래 준비 안전도: <strong id="chkProgressText">${progressPct}%</strong></span>
            <span class="chk-progress-count" id="chkProgressCount">${checkedCount} / 4 완료</span>
          </div>
          <div class="chk-progress-wrap" role="progressbar" aria-valuenow="${progressPct}" aria-valuemin="0" aria-valuemax="100">
            <div class="chk-progress-fill ${isComplete ? 'complete' : ''}" id="chkProgressFill" style="width: ${progressPct}%;"></div>
          </div>
        </div>

        <div id="chkDoneBanner" class="chk-all-done-banner ${isComplete ? 'show' : ''}">
          🎉 모든 안전 수칙을 확인했습니다! 안전하게 거래를 진행하세요.
        </div>

        <ul class="chk-list" id="chkList">${itemsHtml}</ul>
      </article>`;
  }

  /* =========================== 입력 이벤트 =========================== */
  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    runAnalysis(els.input.value);
  });
  els.input.addEventListener('input', () => { els.clear.hidden = !els.input.value; });
  els.clear.addEventListener('click', () => { els.input.value = ''; els.clear.hidden = true; els.input.focus(); });

  async function typeInto(input, text) {
    if (reduceMotion) { input.value = text; return; }
    input.value = '';
    const chunk = Math.max(1, Math.ceil(text.length / 22));
    for (let i = 0; i < text.length; i += chunk) {
      input.value = text.slice(0, i + chunk);
      await sleep(14);
    }
    input.value = text;
  }

  $$('.preset').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (busy) return;
      const preset = SD.PRESETS.find((p) => p.key === btn.dataset.preset);
      if (!preset) return;
      $$('.preset').forEach((p) => p.classList.toggle('active', p === btn));
      els.input.focus({ preventScroll: true });
      await typeInto(els.input, preset.url);
      els.clear.hidden = false;
      runAnalysis(preset.url);
    });
  });

  // 초기 화면에서도 첫 번째 인기 검색어('아이폰 18 Pro') 시세 카드를 즉시 표시
  runMarketLookup('아이폰 18 Pro', { silentToast: true });

  // ?url= 파라미터로 바로 분석 (공유 링크 지원)
  const qp = new URLSearchParams(location.search).get('url');
  if (qp) { els.input.value = qp; els.clear.hidden = false; runAnalysis(qp); }
})(window.SD);
