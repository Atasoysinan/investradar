import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import vm from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('../app/api/briefs/route.ts', import.meta.url), 'utf8');
const news = { articles: [{ title: 'Source headline', url: 'https://example.test/story', source: { name: 'Provider' } }] };
const ai = { choices: [{ message: { content: JSON.stringify({ briefs: [{ headline: 'Test summary', summary: 'Source-based summary.', indices: [0] }] }) } }] };
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness({ limiter = async () => 0, fetcher, env = {} } = {}) {
  const calls = [], clients = [], timers = new Map(), scheduled = [];
  let timerId = 0;
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, URL, Date, AbortController,
    process: { env: { VERCEL_ENV: 'production', GROQ_API_KEY: 'test-key', ...env } },
    setTimeout(fn, ms) { const id = ++timerId; scheduled.push(ms); timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch(url, options) { calls.push({ url, options }); return fetcher ? fetcher(url, options) : Promise.resolve(Response.json(url.includes('/api/news') ? news : ai)); },
    require(name) {
      if (name === 'next/server') return { NextResponse: Response };
      if (name === 'node:crypto') return { createHash };
      if (name === 'node:net') return { isIP };
      if (name === '@/lib/briefsRateLimit') return { getBriefsRateLimit: () => ({ limit(key) { clients.push(key); return limiter(key); } }) };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { calls, clients, timers, scheduled,
    get(query = '', headers = {}) { return exports.GET(new Request('https://example.test/api/briefs'+query, { headers })); },
    timeout() { [...timers.values()].forEach(fn => fn()); },
    dynamic: exports.dynamic,
  };
}

test('successful response and every provider request remain within one bounded non-cacheable operation', async () => {
  const h = harness(); const response = await h.get();
  assert.equal(response.status, 200); assert.equal((await response.json()).briefs[0].headline, 'Test summary');
  assert.deepEqual(h.scheduled, [12000]); assert.equal(h.timers.size, 0);
  assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(h.dynamic, 'force-dynamic');
  assert.equal(h.calls[0].options.signal, h.calls[1].options.signal);
  assert.ok(!h.calls[1].options.signal.aborted);
});

test('rate rejection returns 429 with Retry-After before any news or AI request', async () => {
  const h = harness({ limiter: async () => 1501 }); const response = await h.get('?debug=1');
  assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '2');
  assert.equal(h.calls.length, 0); assert.equal(h.timers.size, 0);
  assert.deepEqual((await response.json()).briefs, []);
});

test('Redis failure is closed and never consumes the AI quota', async () => {
  const h = harness({ limiter: async () => { throw new Error('private token'); } }); const response = await h.get();
  assert.equal(response.status, 503); assert.equal(h.calls.length, 0);
  assert.ok(!(await response.text()).includes('private')); assert.equal(h.timers.size, 0);
});

test('query parameters cannot change the client limiter key and forwarding headers are untrusted off Vercel', async () => {
  const h = harness(); await h.get('', { 'x-vercel-forwarded-for': '203.0.113.1' });
  await h.get('?debug=1&nonce=abc', { 'x-vercel-forwarded-for': '203.0.113.2', 'x-forwarded-for': '198.51.100.1' });
  assert.equal(h.clients[0], h.clients[1]); assert.equal(h.clients[0].length, 64);
});

test('on Vercel only the platform IP header identifies the client', async () => {
  const h = harness({ env: { VERCEL: '1' } });
  await h.get('', { 'x-vercel-forwarded-for': '203.0.113.1', 'x-forwarded-for': '198.51.100.1' });
  assert.equal(h.clients[0], createHash('sha256').update('203.0.113.1').digest('hex'));
  await h.get('', { 'x-vercel-forwarded-for': 'invalid-ip' });
  assert.equal(h.clients[1], createHash('sha256').update('unknown-client').digest('hex'));
});

for (const stage of ['news headers', 'news body', 'AI headers', 'AI body', 'debug body', 'Redis admission']) {
  test(`${stage}: a stalled operation times out, aborts requests and cannot start late AI work`, async () => {
    let release; const held = new Promise(resolve => { release = resolve; });
    const h = harness({
      limiter: stage === 'Redis admission' ? () => held : async () => 0,
      fetcher: async url => {
        if (url.includes('/api/news')) {
          if (stage === 'news headers') return held;
          if (stage === 'news body') return { ok: true, json: () => held };
          return Response.json(news);
        }
        if (stage === 'AI headers') return held;
        return { ok: true, status: 200, json: () => held, text: () => held };
      },
    });
    const pending = h.get(stage === 'debug body' ? '?debug=1' : ''); await flush();
    h.timeout(); const response = await pending;
    assert.equal(response.status, 504); assert.equal(response.headers.get('retry-after'), '30'); assert.equal(h.timers.size, 0);
    assert.ok(h.calls.every(call => call.options.signal.aborted));
    release(stage === 'Redis admission' ? 0 : stage === 'news headers' ? Response.json(news) : stage === 'news body' ? news : ai);
    await flush();
    if (stage.startsWith('news') || stage === 'Redis admission') assert.equal(h.calls.filter(call => call.url.includes('groq.com')).length, 0);
  });
}

for (const stage of ['news', 'AI']) {
  test(`${stage} provider failure returns a generic non-cacheable error`, async () => {
    const h = harness({ fetcher: async url => url.includes('/api/news') && stage === 'AI'
      ? Response.json(news) : Response.json({ error: 'private key detail' }, { status: 429 }) });
    const response = await h.get(); assert.equal(response.status, 502);
    assert.equal(response.headers.get('cache-control'), 'no-store'); assert.ok(!(await response.text()).includes('private'));
    if (stage === 'news') assert.equal(h.calls.length, 1);
  });
}

test('missing AI credentials and non-production requests bypass both Redis and providers', async () => {
  for (const env of [{ GROQ_API_KEY: undefined }, { VERCEL_ENV: 'preview' }, { VERCEL_ENV: undefined }]) {
    const h = harness({ env }); const response = await h.get();
    assert.equal((await response.json()).status, 'unavailable'); assert.equal(h.clients.length, 0); assert.equal(h.calls.length, 0);
  }
});
