import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDataRequest } from './support/data-request.mjs';

function harness(fetcher) {
  const timers = new Map(); let time = 0, next = 0;
  class Clock extends Date { static now() { return time; } }
  const api = loadDataRequest(fetcher, { Date: Clock,
    setTimeout(fn, ms) { const id = ++next; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  return { api, timers, advance(ms) { time += ms; [...timers.values()].forEach(({ fn }) => fn()); } };
}
for (const stage of ['headers', 'body']) {
  test(`${stage}: timeout aborts and rejects even if fetch ignores the signal`, async () => {
    let release, signal, bodyReads = 0;
    const held = new Promise(resolve => { release = resolve; });
    const h = harness(async (_, options) => { signal = options.signal;
      return stage === 'headers' ? held : { ok: true, json() { bodyReads++; return held; } };
    });
    const pending = h.api.fetchJson('https://example.test/data');
    const rejected = assert.rejects(pending, /timed out/);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal([...h.timers.values()][0].ms, 5000);
    h.advance(5000); await rejected;
    assert.equal(signal.aborted, true); assert.equal(h.timers.size, 0);
    release(stage === 'headers' ? { ok: true, json() { bodyReads++; return {}; } } : {});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(bodyReads, stage === 'headers' ? 0 : 1);
  });
}
for (const stage of ['headers', 'body']) {
  test(`${stage}: parent cancellation ends the request and clears its timer`, async () => {
    const controller = new AbortController(); let signal;
    const h = harness(async (_, options) => { signal = options.signal; return stage === 'headers'
      ? new Promise(() => {}) : { ok: true, json: () => new Promise(() => {}) }; });
    const pending = h.api.fetchJson('https://example.test', { signal: controller.signal }, 12000);
    const rejected = assert.rejects(pending, /cancelled/);
    await Promise.resolve(); controller.abort(); await rejected;
    assert.equal(signal.aborted, true); assert.equal(h.timers.size, 0);
  });
}
test('already cancelled work never starts fetch', async () => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  const h = harness(async () => { calls++; });
  await assert.rejects(h.api.fetchJson('https://example.test', { signal: controller.signal }));
  assert.equal(calls, 0); assert.equal(h.timers.size, 0);
});
test('multi-stage budget shrinks and no work starts after expiry', async () => {
  let calls = 0;
  const h = harness(async () => { calls++; return new Promise(() => {}); });
  const read = h.api.createDataRequest();
  let pending = read('https://example.test/first'); let rejected = assert.rejects(pending);
  h.advance(5000); await rejected;
  pending = read('https://example.test/fallback'); rejected = assert.rejects(pending);
  assert.equal([...h.timers.values()][0].ms, 3000);
  h.advance(3000); await rejected;
  await assert.rejects(read('https://example.test/late'), /timed out/);
  assert.equal(calls, 2); assert.equal(h.timers.size, 0);
});
test('successful JSON preserves cache/request options and partial-result headers', async () => {
  let options;
  const h = harness(async (_, init) => { options = init; return Response.json([1], { headers: { 'X-Market-Data-Partial': 'true' } }); });
  const result = await h.api.fetchData('https://example.test', { next: { revalidate: 60 }, headers: { Accept: 'application/json' } });
  assert.deepEqual(result.data, [1]); assert.equal(result.headers.get('X-Market-Data-Partial'), 'true');
  assert.equal(options.next.revalidate, 60); assert.equal(options.headers.Accept, 'application/json'); assert.equal(h.timers.size, 0);
});
for (const response of [() => Response.json({}, { status: 429 }), () => new Response('{broken')]) {
  test('HTTP/JSON failures clear timers and allow a separate retry', async () => {
    let attempt = 0;
    const h = harness(async () => ++attempt === 1 ? response() : Response.json({ success: true }));
    await assert.rejects(h.api.fetchJson('https://example.test')); assert.equal(h.timers.size, 0);
    assert.deepEqual(await h.api.fetchJson('https://example.test'), { success: true }); assert.equal(h.timers.size, 0);
  });
}

// Exercise real route code with short test deadlines, keeping production constants intact.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function route(name, fetcher) {
  const cache = new Map();
  function load(file) {
    const exports = {}; cache.set(file, exports);
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../'+file, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, { exports, Date, URL, process: { env: { FINNHUB_KEY: 'test-key' } },
      setTimeout(fn) { fn(); return 1; },
      require(name) {
        if (name === '@/lib/dataRateLimit') return { checkDataRateLimit: async () => null };
        if (name === 'next/server') return { NextResponse: Response };
        if (name === '@/lib/dataRequest') return loadDataRequest(fetcher, { setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 10)) });
        const file = name.replace('@/', '')+'.ts'; return cache.get(file) || load(file);
      },
    }); return exports;
  }
  return load(`app/api/${name}/route.ts`);
}
const quote = { c: 125, d: 0, dp: 0, h: 130, l: 120, o: 125, pc: 125 };
for (const name of ['market', 'etfs', 'sectors', 'penny']) {
  for (const stage of ['headers', 'body']) {
    test(`${name} ${stage}: timed-out quotes retain healthy partial data and abort stalled work`, async () => {
      let calls = 0; const signals = [];
      const api = route(name, async (_, options) => {
        if (++calls === 1) return Response.json(quote);
        signals.push(options.signal);
        return stage === 'headers' ? new Promise(() => {}) : { ok: true, json: () => new Promise(() => {}) };
      });
      const res = await api.GET(new Request('https://example.test/api/market?symbols=AAPL,MSFT'));
      assert.equal(res.status, 200); assert.equal(res.headers.get('X-Market-Data-Partial'), 'true');
      assert.equal((await res.json()).length, 1); assert.ok(signals.length); assert.ok(signals.every(signal => signal.aborted));
    });
  }
}
for (const [name, query] of [['market','?symbol=AAPL&type=news'],['market','?symbol=AAPL'],['crypto',''],['stocktwits',''],['stocktwits-feed','']]) {
  test(`${name}${query}: total stalled body returns a controlled failure`, async () => {
    const signals = [];
    const api = route(name, async (_, options) => { signals.push(options.signal); return { ok: true, json: () => new Promise(() => {}) }; });
    const res = await api.GET(new Request('https://example.test/api/'+name+query));
    assert.ok(res.status >= 500); assert.ok(signals.length);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(signals.every(signal => signal.aborted));
    assert.ok(!JSON.stringify(await res.json()).includes('timed out'));
  });
}
test('social stream timeout preserves healthy messages and reports partial availability', async () => {
  const api = route('stocktwits-feed', async url => {
    if (url.includes('/trending/')) return Response.json({ symbols: [{ symbol: 'AAPL' }, { symbol: 'MSFT' }] });
    if (url.includes('MSFT')) return { ok: true, json: () => new Promise(() => {}) };
    return Response.json({ messages: [{ body: 'Real source message', created_at: '2026-10-27T10:00:00Z', user: { username: 'test' } }] });
  });
  const res = await api.GET(); const data = await res.json();
  assert.equal(data.status, 'partial'); assert.equal(data.tickers.length, 1); assert.equal(data.tickers[0].symbol, 'AAPL');
});
test('trending timeouts return available sources without fabricated social data', async () => {
  const api = route('trending', async url => url.includes('coingecko') ? Response.json([{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 125, price_change_percentage_24h: null }])
    : { ok: true, json: () => new Promise(() => {}) });
  const res = await api.GET(); const data = await res.json();
  assert.equal(data.coins.length, 1); assert.deepEqual(data.trending, []); assert.deepEqual(data.reddit, []); assert.equal(data.availability.reddit, 'unavailable');
});
