(() => {
  const els = {
    query: document.getElementById('query'),
    searchBtn: document.getElementById('searchBtn'),
    bestOffer: document.getElementById('bestOffer'),
    offers: document.getElementById('offers'),
    imageInput: document.getElementById('imageInput'),
    ocrBtn: document.getElementById('ocrBtn'),
    loadSampleBtn: document.getElementById('loadSampleBtn'),
    saveBtn: document.getElementById('saveBtn'),
    clearBtn: document.getElementById('clearBtn'),
    form: document.getElementById('offerForm'),
    merchant: document.getElementById('merchant'),
    title: document.getElementById('title'),
    url: document.getElementById('url'),
    price: document.getElementById('price'),
    shipping: document.getElementById('shipping'),
    currency: document.getElementById('currency'),
    discount: document.getElementById('discount'),
  };

  const STORAGE = {
    offers: 'bj:offers',
    query: 'bj:query',
    history: 'bj:history',
  };

  const RATES = {
    CNY: 1,
    USD: 7.2,
    EUR: 7.8,
    HKD: 0.92,
  };

  let offers = [];

  function getVal(el, def = '') {
    const v = el && typeof el.value === 'string' ? el.value.trim() : undefined;
    return v === undefined || v === '' ? def : v;
  }

  function toNumber(val) {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const s = String(val).trim();
    // Remove currency symbols and commas
    const cleaned = s.replace(/[,\s]/g, '').replace(/[¥$€]/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }

  function toCNY(amount, currency) {
    const rate = RATES[currency] ?? 1;
    return toNumber(amount) * rate;
  }

  function effectivePriceCNY(offer) {
    const price = toNumber(offer.price);
    const ship = toNumber(offer.shipping);
    const discount = toNumber(offer.discount);
    const cur = offer.currency || 'CNY';
    const total = price + ship - discount;
    return toCNY(total, cur);
  }

  function fmtCurrencyCNY(value) {
    return `¥${value.toFixed(2)}`;
  }

  function fmtCurrency(value, currency) {
    const n = toNumber(value);
    const map = { CNY: '¥', USD: '$', EUR: '€', HKD: '$' };
    return `${map[currency || 'CNY'] || ''}${n.toFixed(2)}`;
  }

  function inferMerchantFromUrl(url) {
    if (!url) return '未知平台';
    try {
      const u = new URL(url);
      let host = u.hostname.replace(/^www\./, '');
      const parts = host.split('.');
      const name = parts.length > 1 ? parts[parts.length - 2] : host;
      const map = {
        jd: '京东', tmall: '天猫', taobao: '淘宝', pinduoduo: '拼多多', amazon: 'Amazon',
        aliexpress: 'AliExpress', suning: '苏宁', dangdang: '当当', walmart: 'Walmart'
      };
      const key = String(name || '').toLowerCase();
      const pretty = map[key] || (key.charAt(0).toUpperCase() + key.slice(1));
      return pretty || '未知平台';
    } catch {
      return '未知平台';
    }
  }

  function renderOffers() {
    if (!els.offers) return;
    els.offers.innerHTML = '';
    offers.forEach((o, idx) => {
      const eff = effectivePriceCNY(o);
      const merchant = (o.merchant && o.merchant.trim()) ? o.merchant : inferMerchantFromUrl(o.url);
      const card = document.createElement('div');
      card.className = 'offer-card';
      card.innerHTML = `
        <div class="offer-head">
          <div class="offer-merchant">${merchant}</div>
          <div class="offer-meta">${fmtCurrencyCNY(eff)}</div>
        </div>
        <div class="offer-actions">
          ${o.url ? `<a href="${o.url}" target="_blank" rel="noopener noreferrer">链接</a>` : ''}
          <button data-idx="${idx}" class="del">删除</button>
        </div>
      `;
      els.offers.appendChild(card);
    });

    els.offers.querySelectorAll('button.del').forEach(btn => {
      btn.addEventListener('click', e => {
        const idx = parseInt(e.currentTarget.getAttribute('data-idx'), 10);
        offers.splice(idx, 1);
        saveOffers();
        updateUI();
      });
    });
  }

  function renderBest() {
    if (!els.bestOffer) return;
    if (!offers.length) {
      els.bestOffer.textContent = '暂无报价';
      return;
    }
    let minIdx = 0;
    let minVal = Infinity;
    offers.forEach((o, i) => {
      const eff = effectivePriceCNY(o);
      if (eff < minVal) { minVal = eff; minIdx = i; }
    });
    const best = offers[minIdx];
    const merchant = (best.merchant && best.merchant.trim()) ? best.merchant : inferMerchantFromUrl(best.url);
    els.bestOffer.innerHTML = `
      最优 <span class="price">${fmtCurrencyCNY(minVal)}</span> · ${merchant}
      ${best.url ? ` <a href="${best.url}" target="_blank" rel="noopener noreferrer">链接</a>` : ''}
    `;
  }

  function updateUI() {
    renderBest();
    renderOffers();
  }

  // OCR helpers
  function cleanTextToQuery(text) {
    const raw = String(text || '').replace(/[\t\r]+/g, '\n');
    const lines = raw.split('\n')
      .map(s => s.trim())
      .filter(s => s && /[\p{L}\p{N}]/u.test(s));
    // 优先选择长度适中、有字母数字的行
    let candidate = lines
      .filter(s => s.length >= 4 && s.length <= 60)
      .sort((a, b) => Math.abs(a.length - 24) - Math.abs(b.length - 24))[0] || lines[0] || '';
    candidate = candidate.replace(/[\u3000\p{P}]+/gu, ' ').replace(/\s+/g, ' ').trim();
    // 去掉常见无意义词
    candidate = candidate.replace(/(官方旗舰店|正品保障|扫码|型号|颜色|规格|优惠|促销)/g, '').trim();
    return candidate || (raw.slice(0, 40).trim());
  }

  async function runOCR(file) {
    if (!file || typeof Tesseract === 'undefined') return;
    if (els.bestOffer) els.bestOffer.textContent = '识别中…';
    try {
      const res = await Tesseract.recognize(file, 'chi_sim+eng', {
        logger: m => {
          if (m && m.progress && els.bestOffer) {
            const pct = Math.round(m.progress * 100);
            els.bestOffer.textContent = `识别中（${pct}%）…`;
          }
        }
      });
      const text = res && res.data && res.data.text ? res.data.text : '';
      const q = cleanTextToQuery(text);
      if (q && els.query) {
        els.query.value = q;
        // 触发搜索
        els.searchBtn && els.searchBtn.click();
      } else {
        if (els.bestOffer) els.bestOffer.textContent = '识别失败或未提取到有效文本';
      }
    } catch (err) {
      console.error(err);
      if (els.bestOffer) els.bestOffer.textContent = '识别发生错误';
    }
  }

  function saveOffers() {
    localStorage.setItem(STORAGE.offers, JSON.stringify(offers));
  }

  function saveQuery(q) {
    localStorage.setItem(STORAGE.query, q);
    try {
      const history = JSON.parse(localStorage.getItem(STORAGE.history) || '[]');
      if (q && !history.includes(q)) {
        history.unshift(q);
        localStorage.setItem(STORAGE.history, JSON.stringify(history.slice(0, 20)));
      }
    } catch {}
  }

  function loadFromStorage() {
    try {
      offers = JSON.parse(localStorage.getItem(STORAGE.offers) || '[]');
    } catch { offers = []; }
    const q = localStorage.getItem(STORAGE.query) || '';
    if (els.query) els.query.value = q;
    updateUI();
  }

  function addOffer(obj) {
    // de-duplicate by URL
    if (obj.url) {
      const idx = offers.findIndex(x => x.url === obj.url);
      if (idx >= 0) {
        offers[idx] = obj;
      } else {
        offers.push(obj);
      }
    } else {
      offers.push(obj);
    }
    saveOffers();
    updateUI();
  }

  function sampleOffers(query) {
    const base = (q) => ({ title: q || '示例商品', shipping: 0, discount: 0 });
    return [
      { merchant: '京东', url: 'https://jd.com/example', price: 5999, currency: 'CNY', ...base(query) },
      { merchant: '天猫', url: 'https://tmall.com/example', price: 5888, currency: 'CNY', shipping: 15, discount: 100, title: query },
      { merchant: '拼多多', url: 'https://pinduoduo.com/example', price: 5799, currency: 'CNY', shipping: 0, discount: 0, title: query },
      { merchant: 'Amazon US', url: 'https://amazon.com/example', price: 799, currency: 'USD', shipping: 20, discount: 30, title: query },
    ];
  }

  // Events
  els.searchBtn?.addEventListener('click', async () => {
    const q = (els.query?.value || '').trim();
    saveQuery(q);
    if (els.bestOffer) els.bestOffer.textContent = '自动比较中…';
    try {
      const arr = await window.runSources(q);
      offers = Array.isArray(arr) ? arr : [];
    } catch {
      offers = sampleOffers(q);
    }
    saveOffers();
    updateUI();
  });

  els.loadSampleBtn?.addEventListener('click', () => {
    const q = (els.query?.value || '').trim();
    offers = sampleOffers(q);
    saveOffers();
    updateUI();
  });

  els.saveBtn?.addEventListener('click', () => {
    saveOffers();
    const q = (els.query?.value || '').trim();
    saveQuery(q);
    alert('已保存当前商品与报价到本地浏览器');
  });

  els.clearBtn?.addEventListener('click', () => {
    if (confirm('确认清空当前报价？')) {
      offers = [];
      saveOffers();
      updateUI();
    }
  });

  // OCR events
  els.ocrBtn?.addEventListener('click', () => {
    els.imageInput && els.imageInput.click();
  });
  els.imageInput?.addEventListener('change', () => {
    const file = els.imageInput.files && els.imageInput.files[0];
    if (file) {
      runOCR(file);
    }
    // 重置选择状态，便于重复选择同一文件
    els.imageInput.value = '';
  });

  els.form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const obj = {
      merchant: '',
      title: getVal(els.title, ''),
      url: getVal(els.url),
      price: getVal(els.price, '0'),
      shipping: getVal(els.shipping, '0'),
      currency: els.currency ? els.currency.value : 'CNY',
      discount: getVal(els.discount, '0'),
    };
    addOffer(obj);
    els.form.reset();
  });

  // Init
  loadFromStorage();

  // progress UI
  document.addEventListener('sources:progress', (ev) => {
    const { done, total } = ev.detail || {};
    if (els.bestOffer) {
      els.bestOffer.textContent = `自动比较中（${done}/${total}）…`;
    }
  });
})();