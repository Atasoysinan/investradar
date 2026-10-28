import { loadDataRequest } from './support/data-request.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function route(name, fetcher) {
  const cache = new Map();
  function load(path) {
    if (cache.has(path)) return cache.get(path);
    const exports = {}; cache.set(path, exports);
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, { exports, URL, Date, fetch: fetcher, process: { env: {} }, require: name => {
        if (name === '@/lib/dataRateLimit') return { checkDataRateLimit: async () => null };
      if (name === '@/lib/dataRequest') return loadDataRequest(fetcher);
        if (name === 'next/server') return { NextResponse: Response };
      if (name === '@/lib/socialData') return load('lib/socialData.ts');
      throw new Error(`Unexpected dependency: ${name}`);
    } });
    return exports;
  }
  return load(`app/api/${name}/route.ts`);
}
const symbols = { symbols: [{ symbol: 'AAPL', title: 'Apple', watchlist_count: 42 }, { symbol: 'MSFT', title: 'Microsoft' }] };
const message = { body: 'Provider test conversation', created_at: '2026-10-24T12:00:00Z', user: { username: 'provider_test_user' }, entities: { sentiment: { basic: 'Bullish' } } };
for (const name of ['stocktwits', 'stocktwits-feed']) {
  for (const [failure, fetcher] of [
    ['HTTP failure', async () => Response.json({ symbols: symbols.symbols }, { status: 429 })],
    ['network failure', async () => { throw new Error('private provider detail'); }],
    ['malformed JSON', async () => new Response('not JSON')],
    ['malformed payload', async () => Response.json({ error: 'provider quota exceeded' })],
  ]) {
    test(`${name}: ${failure} returns failure without manufactured data`, async () => {
      const response = await route(name, fetcher).GET();
      assert.equal(response.status, 502); assert.equal(response.headers.get('cache-control'), 'no-store');
      const payload = await response.json();
      if (name === 'stocktwits-feed') assert.deepEqual(payload, { tickers: [], status: 'unavailable' });
      else assert.deepEqual(payload, { error: 'Stocktwits data is temporarily unavailable.' });
    });
  }
}

test('real symbol counts are preserved and missing counts are not invented', async () => {
  const response = await route('stocktwits', async () => Response.json(symbols)).GET();
  const data = await response.json(); assert.equal(data[0].watchlist_count, 42); assert.equal(data[1].watchlist_count, null);
  assert.equal(data[0].sentiment, null);
});

test('partial streams retain only actual messages and report partial availability', async () => {
  const response = await route('stocktwits-feed', async url => {
    if (url.includes('/trending/')) return Response.json(symbols);
    if (url.includes('/AAPL.')) return Response.json({ messages: [message] });
    return Response.json({ messages: [message] }, { status: 503 });
  }).GET();
  const data = await response.json(); assert.equal(data.status, 'partial'); assert.equal(data.tickers.length, 1);
  assert.equal(data.tickers[0].symbol, 'AAPL'); assert.equal(data.tickers[0].messages[0].created_at, message.created_at);
  assert.equal(data.tickers[0].messages[0].user.username, message.user.username);
});

test('total stream failure is unavailable even when trending symbols succeed', async () => {
  const response = await route('stocktwits-feed', async url => url.includes('/trending/')
    ? Response.json(symbols) : Response.json({}, { status: 500 })).GET();
  assert.equal(response.status, 502); assert.deepEqual((await response.json()).tickers, []);
});

for (const messages of [[], [null, {}, { ...message, created_at: '' }, { ...message, user: {} }]]) {
  test(`empty or invalid source messages never produce fallback conversations: ${messages.length}`, async () => {
    const response = await route('stocktwits-feed', async url => Response.json(url.includes('/trending/') ? symbols : { messages })).GET();
    const data = await response.json(); assert.equal(data.status, 'ok'); assert.deepEqual(data.tickers, []);
  });
}

test('valid empty symbol response is distinct from source failure', async () => {
  const response = await route('stocktwits-feed', async () => Response.json({ symbols: [] })).GET();
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { tickers: [], status: 'ok' });
});

function source(url, reddit) {
  if (url.includes('reddit.com')) return reddit(url);
  if (url.includes('yahoo.com')) return Response.json({ finance: { result: [{ quotes: [] }] } });
  return Response.json([]);
}

test('unavailable Reddit returns no fabricated posts and leaves other feeds usable', async () => {
  const response = await route('trending', async url => source(url, () => Response.json({}, { status: 403 }))).GET();
  const data = await response.json(); assert.deepEqual(data.reddit, []); assert.equal(data.availability.reddit, 'unavailable');
  assert.ok(Array.isArray(data.trending)); assert.ok(Array.isArray(data.coins));
});

test('Reddit fallback uses a real second source and preserves actual score and URL', async () => {
  const post = { data: { title: '$AAPL provider test post', score: 12, subreddit: 'stocks', permalink: '/r/stocks/comments/test/real-post/' } };
  const response = await route('trending', async url => source(url, value => value.includes('/stocks/')
    ? Response.json({}, { status: 503 }) : Response.json({ data: { children: [null, {}, post] } }))).GET();
  const data = await response.json(); assert.equal(data.availability.reddit, 'ok'); assert.equal(data.reddit.length, 1);
  assert.equal(data.reddit[0].score, 12); assert.equal(data.reddit[0].url, 'https://reddit.com'+post.data.permalink);
});

test('valid empty Reddit is not mislabeled as an outage', async () => {
  const response = await route('trending', async url => source(url, () => Response.json({ data: { children: [] } }))).GET();
  const data = await response.json(); assert.deepEqual(data.reddit, []); assert.equal(data.availability.reddit, 'ok');
});

function component(name, initialResponse) {
  const state = []; let cursor = 0, mounted = false, tree, poll, respond = initialResponse;
  const effects = [], exports = {};
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../components/${name}.tsx`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, Date, AbortController, fetch: (...args) => respond(...args),
    setInterval(callback) { poll = callback; return 1; }, clearInterval() {},
    require(name) {
      if (name === '@/lib/dataRequest') return loadDataRequest((...args) => respond(...args));
      if (name === 'react') return {
        useState(initial) { const index = cursor++; if (!(index in state)) state[index] = initial;
          return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; },
        useEffect(effect) { if (!mounted) effects.push(effect); },
      };
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      return { default: 'a' };
    },
  });
  function render() { cursor = 0; tree = exports.default(); if (!mounted) { mounted = true; effects.forEach(effect => effect()); } }
  function text(node) { if (node == null || typeof node === 'boolean') return ''; if (Array.isArray(node)) return node.map(text).join('');
    return typeof node === 'object' ? text(node.props?.children) : String(node); }
  function nodes(node) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(nodes);
    return [node, ...nodes(node.props?.children)]; }
  render();
  return {
    async settle() { await new Promise(resolve => setImmediate(resolve)); render(); },
    text: () => text(tree), response(fn) { respond = fn; }, poll() { poll(); },
    click(label) { nodes(tree).find(node => node.type === 'button' && text(node) === label).props.onClick(); render(); },
  };
}
const emptyTrending = { trending: [], reddit: [], coins: [], availability: { reddit: 'unavailable' } };

test('social tabs show explicit source failure and clear previously displayed social data', async () => {
  const h = component('MarketBuzz', async url => Response.json(url.includes('/trending') ? emptyTrending
    : [{ symbol: 'AAPL', name: 'Provider symbol', watchlist_count: 42, sentiment: null }]));
  await h.settle(); h.click('Social'); assert.ok(h.text().includes('42 watching'));
  h.response(async url => url.includes('/trending') ? Response.json(emptyTrending) : Response.json({}, { status: 502 }));
  h.poll(); await h.settle(); assert.ok(h.text().includes('Stocktwits is temporarily unavailable.'));
  assert.ok(!h.text().includes('42 watching')); h.click('Reddit'); assert.ok(h.text().includes('Reddit is temporarily unavailable.'));
});

test('valid empty social sources show empty messages rather than outages', async () => {
  const h = component('MarketBuzz', async url => Response.json(url.includes('/trending')
    ? { ...emptyTrending, availability: { reddit: 'ok' } } : []));
  await h.settle(); h.click('Social'); assert.ok(h.text().includes('No social data'));
  h.click('Reddit'); assert.ok(h.text().includes('No Reddit data'));
});

for (const [status, message] of [[502, 'Stocktwits conversations are temporarily unavailable.'], [200, 'No recent Stocktwits conversations.']]) {
  test(`conversation panel distinguishes ${status === 502 ? 'source failure' : 'an empty source'}`, async () => {
    const h = component('MarketChatter', async () => Response.json({ tickers: [] }, { status }));
    await h.settle(); assert.equal(h.text(), message);
  });
}

test('partial conversation panel preserves source time and does not invent a missing watcher count', async () => {
  const h = component('MarketChatter', async () => Response.json({ status: 'partial', tickers: [{
    symbol: 'AAPL', watchlist_count: null, messages: [{ ...message, sentiment: 'Bullish' }],
  }] }));
  await h.settle(); assert.ok(h.text().includes('Some Stocktwits conversations are unavailable.'));
  assert.ok(h.text().includes(message.body)); assert.ok(!h.text().includes('watching'));
});

test('partial source failure stays visible when healthy streams have no messages', async () => {
  const h = component('MarketChatter', async () => Response.json({ tickers: [], status: 'partial' }));
  await h.settle(); assert.equal(h.text(), 'Some Stocktwits conversations are unavailable. No recent messages from available sources.');
});


for (const tab of ['Trending', 'Crypto']) {
  for (const [label, price, change, expected] of [
    ['null price and change', null, null, '— —'],
    ['missing price with valid change', undefined, -2.5, '— ▼ 2.50%'],
    ['valid price with missing change', 12.5, undefined, '$12.50 —'],
    ['real zero change', 12.5, 0, '$12.50 — 0.00%'],
    ['positive change', 12.5, 1.25, '$12.50 ▲ 1.25%'],
    ['invalid strings', '12.5', '2', '— —'],
    ['nonfinite values', NaN, Infinity, '— —'],
    ['negative price', -10, -1, '— ▼ 1.00%'],
  ]) {
    test(`Market Buzz ${tab}: ${label} preserves healthy rows and displays fields independently`, async () => {
      const payload = { ...emptyTrending,
        trending: [{ symbol: 'TEST', rank: 1, price, dp: change, isCrypto: false },
          { symbol: 'GOOD', rank: 2, price: 125, dp: 3, isCrypto: false }],
        coins: [{ id: 'test', symbol: 'TEST', name: 'Test coin', current_price: price, price_change_percentage_24h: change },
          { id: 'good', symbol: 'GOOD', name: 'Good coin', current_price: 125, price_change_percentage_24h: 3 }],
      };
      const h = component('MarketBuzz', async url => ({ ok: true, json: async () => url.includes('/trending') ? payload : [] }));
      await h.settle(); h.click(tab);
      const text = h.text().replace(/\s+/g, ' ');
      for (const part of expected.split(' ')) assert.ok(text.includes(part), text);
      assert.ok(text.includes('$125.00')); assert.ok(text.includes('3.00%')); assert.ok(text.includes('GOOD'));
      assert.ok(!/NaN|Infinity|undefined|null/.test(text));
      if (!Number.isFinite(change)) assert.ok(!text.includes('0.00%'), text);
    });
  }
}
