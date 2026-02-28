// 数据源适配器：并行拉取多个来源，聚合报价
// 目前包含：示例数据源、Local JSON 数据源（data/<slug>.json）

function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .slice(0, 80);
}

function dispatchProgress(done, total) {
  const ev = new CustomEvent('sources:progress', { detail: { done, total } });
  document.dispatchEvent(ev);
}

async function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

async function sampleAdapter(query) {
  const q = String(query || '').trim();
  const base = (t) => ({ title: t || '示例商品', shipping: 0, discount: 0 });
  // 模拟网络延迟
  await new Promise((r) => setTimeout(r, 300));
  return [
    { merchant: '京东', url: 'https://jd.com/example', price: 5999, currency: 'CNY', ...base(q) },
    { merchant: '天猫', url: 'https://tmall.com/example', price: 5888, currency: 'CNY', shipping: 15, discount: 100, title: q },
    { merchant: '拼多多', url: 'https://pinduoduo.com/example', price: 5799, currency: 'CNY', title: q },
    { merchant: 'Amazon US', url: 'https://amazon.com/example', price: 799, currency: 'USD', shipping: 20, discount: 30, title: q },
  ];
}

async function localJsonAdapter(query) {
  const slug = slugify(query);
  if (!slug) return [];
  try {
    const res = await withTimeout(fetch(`./data/${slug}.json`, { cache: 'no-store' }), 1500);
    if (!res.ok) return [];
    const arr = await res.json();
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch {
    return [];
  }
}

function dedupeByUrl(arr) {
  const seen = new Map();
  for (const o of arr) {
    if (o && o.url) {
      seen.set(o.url, o);
    } else {
      // 没有 URL 的也保留（用对象引用去重意义不大）
      seen.set(Symbol('no-url'), o);
    }
  }
  return Array.from(seen.values());
}

async function runSources(query) {
  const sources = [sampleAdapter, localJsonAdapter];
  const total = sources.length;
  let done = 0;
  const out = [];

  const settled = await Promise.allSettled(
    sources.map(async (fn) => {
      const res = await fn(query);
      out.push(...(Array.isArray(res) ? res : []));
      done += 1;
      dispatchProgress(done, total);
    })
  );

  // 可根据需要检查 settled 的错误
  return dedupeByUrl(out);
}

window.runSources = runSources;