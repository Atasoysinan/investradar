import { newsArticles } from '../lib/newsProvider.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { socialRecord } from '../lib/socialData.ts';
import { loadDataRequest } from './support/data-request.mjs';
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness(name, fetcher, limited = null) {
  let now = Date.now();
  const timers = new Map(); let id = 0;
  class Clock extends Date { static now() { return now; } }
  const overrides = { Date: Clock, setTimeout(fn, ms) { timers.set(++id, { fn, at: now + ms }); return id; }, clearTimeout(key) { timers.delete(key); } };
  const calls = [];
  const helper = loadDataRequest((url, options) => { calls.push({ url, options }); return fetcher(url, options, calls.length); }, overrides);
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../app/api/${name}/route.ts`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, URLSearchParams, Date: Clock, process: { env: { GNEWS_KEY: 'fixture', NEWSAPI_KEY: 'fixture' } }, require(name) {
      if (name === '@/lib/newsProvider') return { newsArticles };
      if (name.endsWith('socialData')) return { socialRecord };
      if (name === 'next/server') return { NextResponse: Response };
      if (name.endsWith('dataRateLimit')) return { checkDataRateLimit: async () => limited };
      if (name.endsWith('dataRequest')) return helper;
      throw new Error(name);
    },
  });
  return { calls, timers, run: () => exports.GET(new Request('http://localhost/api/' + name)), async advance(ms) { now += ms; for (const [key, timer] of timers) if (timer.at <= now) { timers.delete(key); timer.fn(); } await flush(); } };
}
const article = (source = 'Fixture') => ({ title: 'Market news', url: 'https://example.com/news', publishedAt: new Date().toISOString(), source: { name: source } });
for (const name of ['global-news', 'topic-news', 'breaking-news']) {
  for (const phase of ['headers', 'body']) test(`${name}: bounded stalled ${phase}, abort and timer cleanup`, async () => {
    const h = harness(name, () => phase === 'headers' ? new Promise(() => {}) : Promise.resolve({ ok: true, json: () => new Promise(() => {}) }));
    const result = h.run(); await flush(); await h.advance(5000);
    if (name === 'breaking-news') { assert.equal(h.calls.length, 2); await h.advance(3000); }
    const response = await result;
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.ok(Object.values(body).filter(Array.isArray).every(value => value.length === 0));
    assert.ok(h.calls.every(call => call.options.signal.aborted)); assert.equal(h.timers.size, 0);
  });
  test(`${name}: rate rejection starts no provider calls`, async () => {
    const h = harness(name, () => { throw new Error('unexpected'); }, new Response(null, { status: 429 }));
    assert.equal((await h.run()).status, 429); assert.equal(h.calls.length, 0);
  });
  test(`${name}: healthy response retains cache and content`, async () => {
    let count = 0;
    const h = harness(name, async () => Response.json({ articles: Array.from({ length: 9 }, () => article(`Source ${++count}`)) }));
    const body = await (await h.run()).json();
    assert.ok(Object.values(body).every(value => value.length > 0));
    assert.ok(h.calls.every(call => call.options.next.revalidate === (name === 'breaking-news' ? 300 : 1800)));
    assert.equal(h.timers.size, 0);
    if (name === 'breaking-news') assert.equal(h.calls.length, 1);
  });
}
test('topic-news: a stalled source preserves other categories', async () => {
  const h = harness('topic-news', async (_url, _options, index) => index === 1 ? new Promise(() => {}) : Response.json({ articles: [article(`Source ${index}`)] }));
  const pending = h.run(); await flush(); await h.advance(5000);
  const body = await (await pending).json(); assert.equal(body.markets.length, 0); assert.equal(body.tech.length, 1); assert.equal(body.geopolitics.length, 1);
});
test('breaking-news: timed out primary uses healthy fallback', async () => {
  const h = harness('breaking-news', async (_url, _options, index) => index === 1 ? new Promise(() => {}) : Response.json({ articles: [article()] }));
  const pending = h.run(); await flush(); await h.advance(5000);
  assert.equal((await (await pending).json()).articles.length, 1); assert.equal(h.calls.length, 2); assert.equal(h.timers.size, 0);
});
test('breaking-news: exhausted shared deadline prevents fallback', async () => {
  const h = harness('breaking-news', () => new Promise(() => {})); const pending = h.run(); await flush(); await h.advance(8001);
  assert.equal((await pending).status, 503); assert.equal(h.calls.length, 1);
});
test('global-news: late provider result cannot replace timeout response', async () => {
  let resolve; const h = harness('global-news', () => new Promise(r => { resolve = r; }));
  const pending = h.run(); await flush(); await h.advance(5000); const response = await pending;
  resolve(Response.json({ articles: [article()] })); await flush();
  assert.equal(response.status, 503); assert.deepEqual((await response.json()).americas, []); assert.equal(h.timers.size, 0);
});
test('global-news: one stalled regional source preserves other regions', async () => {
  const h = harness('global-news', async (_url, _options, index) => index === 2 ? new Promise(() => {}) : Response.json({ articles: [article(`Region ${index}`)] }));
  const pending = h.run(); await flush(); await h.advance(5000);
  const response = await pending; assert.equal(response.status, 200); assert.equal(response.headers.get('x-news-data-partial'), 'true');
  const body = await response.json(); assert.equal(body.americas.length, 1); assert.deepEqual(body.europe, []); assert.equal(body.asia.length, 1); assert.equal(h.timers.size, 0);
});
