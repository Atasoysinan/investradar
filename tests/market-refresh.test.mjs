import { ETF_INFO, ETF_CATEGORIES } from '../lib/etfCatalog.ts';
import { loadDataRequest } from './support/data-request.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../app/markets/page.tsx', import.meta.url), 'utf8');
function harness() {
  const state = [], dependencies = [], cleanups = [], scheduled = [], requests = [];
  let cursor = 0, effectCursor = 0, tree, clock = 100000;
  let respond = async () => Response.json([]);
  class Clock extends Date { constructor() { super(clock); } }
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports, Date: Clock, AbortController, URL,
    fetch: (url, options) => { requests.push({ url, signal: options.signal }); return respond(url); },
    require: name => {
      if (name === '@/lib/etfCatalog') return { ETF_INFO, ETF_CATEGORIES };
      if (name === '@/lib/dataRequest') return loadDataRequest((url, options) => { requests.push({ url, signal: options.signal }); return respond(url); });
      if (name === 'react') return {
        useState: initial => {
          const index = cursor++;
          if (!(index in state)) state[index] = initial;
          return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
        },
        useEffect: (effect, deps) => {
          const index = effectCursor++;
          if (!dependencies[index] || deps.some((value, i) => value !== dependencies[index][i])) {
            scheduled.push(() => { cleanups[index]?.(); cleanups[index] = effect(); });
            dependencies[index] = deps;
          }
        },
      };
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (name === 'next/navigation') return { useRouter: () => ({ push() {} }) };
      return { default: () => null };
    },
  });
  function render() { cursor = 0; effectCursor = 0; tree = exports.default(); scheduled.splice(0).forEach(run => run()); }
  function nodes(node) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(nodes);
    return [node, ...nodes(node.props?.children)];
  }
  function text(node) {
    if (node == null || typeof node === 'boolean') return '';
    if (typeof node !== 'object') return String(node);
    if (Array.isArray(node)) return node.map(text).join('');
    return text(node.props?.children);
  }
  function button(label) { return nodes(tree).find(node => node.type === 'button' && text(node).trim().startsWith(label)); }
  async function settle() { await new Promise(resolve => setImmediate(resolve)); render(); }
  render();
  return {
    requests, settle, render, snapshot: () => text(tree),
    unavailableChanges: () => nodes(tree).filter(node => node.props?.['aria-label'] === '24-hour change unavailable'),
    click(label) { const b = button(label); assert.ok(b); assert.ok(!b.props.disabled); b.props.onClick(); render(); },
    label: () => text(button('↻ Refresh')).trim(),
    disabled: () => button('↻ Refresh').props.disabled,
    alert: () => nodes(tree).filter(node => node.props?.role === 'alert').map(text).join(''),
    response(fn) { respond = fn; }, advance() { clock += 60000; },
  };
}

const endpoints = {
  Watchlist: '/api/market?symbols=', 'S&P 500': '/api/market?type=index-quotes&tab=sp500',
  NASDAQ: '/api/market?type=index-quotes&tab=nasdaq', 'Penny Stocks': '/api/penny', ETFs: '/api/etfs', Crypto: '/api/crypto',
};
for (const [tab, endpoint] of Object.entries(endpoints)) {
  test(`Refresh requests only the active ${tab} endpoint and advances its timestamp on success`, async () => {
    const h = harness(); await h.settle();
    if (tab !== 'Watchlist') { h.click(tab); await h.settle(); }
    const before = h.label(); h.advance();
    const count = h.requests.length;
    h.click('↻ Refresh'); assert.equal(h.disabled(), true); await h.settle();
    assert.equal(h.requests.length, count + 1);
    assert.ok(h.requests.at(-1).url.startsWith(endpoint));
    assert.notEqual(h.label(), before);
    assert.equal(h.disabled(), false);
  });
}

for (const [name, response] of [
  ['HTTP error', async () => Response.json({ error: 'private' }, { status: 500 })],
  ['malformed JSON', async () => new Response('invalid')],
  ['invalid payload', async () => Response.json({ error: 'private' })],
  ['network failure', async () => { throw new Error('private'); }],
]) {
  test(`${name} preserves the previous timestamp and allows retry`, async () => {
    const h = harness(); await h.settle(); const before = h.label(); h.advance();
    h.response(response); h.click('↻ Refresh'); await h.settle();
    assert.equal(h.label(), before); assert.equal(h.disabled(), false);
    assert.equal(h.alert(), 'Unable to refresh market data. Please try again.');
    h.response(async () => Response.json([])); h.click('↻ Refresh'); await h.settle();
    assert.notEqual(h.label(), before); assert.equal(h.alert(), '');
  });
}

test('a tab with a failed initial load does not inherit another tab timestamp', async () => {
  const h = harness(); await h.settle();
  h.response(async () => new Response('', { status: 500 })); h.click('Crypto'); await h.settle();
  assert.equal(h.label(), '↻ Refresh');
});

test('a late response from a previous tab is ignored and its request is aborted', async () => {
  const h = harness(); await h.settle();
  let resolve;
  h.response(() => new Promise(done => { resolve = done; }));
  h.click('S&P 500'); const old = h.requests.at(-1);
  h.response(async () => Response.json([])); h.click('NASDAQ'); await h.settle();
  const before = h.label(); assert.equal(old.signal.aborted, true);
  h.advance(); resolve(Response.json([])); await h.settle();
  assert.equal(h.label(), before);
});

const quote = symbol => ({ symbol, c: 100, d: 1, dp: 1, h: 101, l: 99, o: 99, pc: 99 });
const fixtures = {
  Watchlist: quote('WATCHLIST_ONLY'),
  'S&P 500': quote('SP500_ONLY'),
  NASDAQ: quote('NASDAQ_ONLY'),
  'Penny Stocks': { ...quote('PENNY_ONLY'), name: 'Penny company' },
  ETFs: { ...quote('ETF_ONLY'), name: 'ETF fund', category: 'US Broad' },
  Crypto: { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', image: 'https://example.test/coin.png', current_price: 100, price_change_percentage_24h: 1, market_cap: 1000, total_volume: 50 },
};

test('failed index switches never show rows from the other index and preserve each index cache', async () => {
  const h = harness(); await h.settle();
  h.response(async () => Response.json([fixtures.NASDAQ])); h.click('NASDAQ'); await h.settle();
  assert.ok(h.snapshot().includes('NASDAQ_ONLY'));
  h.response(async () => new Response('', { status: 500 })); h.click('S&P 500'); await h.settle();
  assert.ok(!h.snapshot().includes('NASDAQ_ONLY'));
  h.response(async () => Response.json([fixtures['S&P 500']])); h.click('↻ Refresh'); await h.settle();
  assert.ok(h.snapshot().includes('SP500_ONLY'));
  h.response(async () => new Response('', { status: 500 })); h.click('NASDAQ'); await h.settle();
  assert.ok(h.snapshot().includes('NASDAQ_ONLY'));
  assert.ok(!h.snapshot().includes('SP500_ONLY'));
});

for (const tab of Object.keys(endpoints)) {
  test(`${tab}: invalid rows cannot crash rendering, replace data or advance the timestamp`, async () => {
    const h = harness(); await h.settle();
    h.response(async () => Response.json([fixtures[tab]]));
    if (tab === 'Watchlist') h.click('↻ Refresh'); else h.click(tab);
    await h.settle(); const before = h.snapshot(); const time = h.label(); h.advance();
    for (const invalid of [null, {}, 42, { ...fixtures[tab], [tab === 'Crypto' ? 'current_price' : 'c']: '100' }, { ...fixtures[tab], symbol: null }]) {
      h.response(async () => Response.json([fixtures[tab], invalid])); h.click('↻ Refresh');
      await h.settle();
      assert.equal(h.label(), time);
      assert.equal(h.alert(), 'Unable to refresh market data. Please try again.');
      assert.equal(h.disabled(), false);
      assert.ok(before.includes(tab === 'Crypto' ? 'Bitcoin' : fixtures[tab].symbol));
      assert.ok(h.snapshot().includes(tab === 'Crypto' ? 'Bitcoin' : fixtures[tab].symbol));
    }
  });
}

test('non-finite numbers and malformed image URLs are rejected before rendering', async () => {
  const h = harness(); await h.settle();
  for (const row of [{ ...fixtures.Crypto, current_price: Infinity }, { ...fixtures.Crypto, image: 'not-a-url' }]) {
    h.response(async () => ({ ok: true, json: async () => [row] }));
    if (h.requests.at(-1).url !== '/api/crypto') h.click('Crypto'); else h.click('↻ Refresh');
    await h.settle(); assert.equal(h.label(), '↻ Refresh');
    assert.equal(h.alert(), 'Unable to refresh market data. Please try again.');
  }
});


test('Crypto retains rows with null change and shows an unavailable marker instead of zero', async () => {
  const h = harness(); await h.settle();
  const missing = { ...fixtures.Crypto, id: 'figure-heloc', name: 'Figure Heloc', price_change_percentage_24h: null };
  h.response(async () => Response.json([fixtures.Crypto, missing]));
  h.click('Crypto'); await h.settle();
  assert.equal(h.alert(), ''); assert.ok(h.snapshot().includes('Bitcoin'));
  assert.ok(h.snapshot().includes('Figure Heloc'));
  assert.equal(h.unavailableChanges().length, 1);
  assert.equal(h.unavailableChanges()[0].props.children, '—');
  assert.ok(!h.snapshot().includes('0.00%'));
  const previousTime = h.label(); h.advance();
  h.click('↻ Refresh'); await h.settle();
  assert.notEqual(h.label(), previousTime); assert.equal(h.disabled(), false);
});

test('Crypto zero and negative changes retain numeric formatting and replace a missing change', async () => {
  const h = harness(); await h.settle();
  h.response(async () => Response.json([{ ...fixtures.Crypto, price_change_percentage_24h: null }]));
  h.click('Crypto'); await h.settle(); assert.equal(h.unavailableChanges().length, 1);
  for (const [change, label] of [[0, '▲ 0.00%'], [-1.25, '▼ 1.25%'], [2, '▲ 2.00%']]) {
    h.response(async () => Response.json([{ ...fixtures.Crypto, price_change_percentage_24h: change }]));
    h.click('↻ Refresh'); await h.settle();
    assert.equal(h.unavailableChanges().length, 0); assert.ok(h.snapshot().includes(label));
    assert.equal(h.alert(), '');
  }
});

test('Crypto still rejects absent, string and non-finite change fields without losing valid rows', async () => {
  const h = harness(); await h.settle();
  h.response(async () => Response.json([{ ...fixtures.Crypto, price_change_percentage_24h: null }]));
  h.click('Crypto'); await h.settle(); const time = h.label(); h.advance();
  for (const change of [undefined, '0', NaN, Infinity]) {
    h.response(async () => ({ ok: true, json: async () => [{ ...fixtures.Crypto, price_change_percentage_24h: change }] }));
    h.click('↻ Refresh'); await h.settle();
    assert.equal(h.label(), time); assert.equal(h.unavailableChanges().length, 1);
    assert.equal(h.alert(), 'Unable to refresh market data. Please try again.');
  }
});

test('partial quotes show an explicit warning; total provider failure preserves last valid data and time', async () => {
  const h = harness(); await h.settle();
  h.response(async () => Response.json([fixtures.Watchlist], { headers: { 'X-Market-Data-Partial': 'true' } }));
  h.click('↻ Refresh'); await h.settle();
  assert.equal(h.alert(), 'Some market data is unavailable. Showing available quotes.');
  assert.ok(h.snapshot().includes('WATCHLIST_ONLY')); const time = h.label(); h.advance();
  h.response(async () => Response.json({ error: 'Market data is temporarily unavailable. Please try again.' }, { status: 502 }));
  h.click('↻ Refresh'); await h.settle();
  assert.equal(h.label(), time); assert.ok(h.snapshot().includes('WATCHLIST_ONLY'));
  assert.equal(h.alert(), 'Unable to refresh market data. Please try again.');
});

test('ETF category filters expose exactly the matching fund rows and All restores the full list',async()=>{
 const h=harness();await h.settle();
 const funds=Object.entries(ETF_INFO).map(([symbol,info])=>({symbol,name:`Fund ${symbol}`,category:info.category,c:125,d:0,dp:0}));
 h.response(async()=>Response.json(funds));h.click('ETFs');await h.settle();
 for(const category of ETF_CATEGORIES.filter(c=>c!=='All')){
  h.click(category);await h.settle();
  for(const fund of funds)assert.equal(h.snapshot().includes(`Fund ${fund.symbol}`),fund.category===category,`${category}: ${fund.symbol}`);
 }
 h.click('All');await h.settle();for(const fund of funds)assert.ok(h.snapshot().includes(`Fund ${fund.symbol}`));
});
