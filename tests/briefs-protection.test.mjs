import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import vm from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('../app/api/briefs/route.ts', import.meta.url), 'utf8');
const news = { articles: [{ title: 'Source headline', url: 'https://example.test/story', source: { name: 'Provider' } }] };
const ai = { choices: [{ message: { content: JSON.stringify({ briefs: [{ articleId: createHash('sha256').update('https://example.test/story').digest('hex').slice(0, 16) }] }) } }] };
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
  assert.equal(response.status, 200); assert.equal((await response.json()).briefs[0].headline, 'Source headline');
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

const selectedId = url => createHash('sha256').update(url).digest('hex').slice(0, 16);
for (const query of ['', '?debug=1']) {
  test(`all-invalid news returns a generic error without AI work (${query || 'normal'})`, async () => {
    const h = harness({ fetcher: async () => Response.json({ articles: [
      null, 1, {}, { title: '   ', url: 'https://example.test/blank' },
      { title: '[Removed]', url: 'https://example.test/removed' },
      { title: 'x'.repeat(501), url: 'https://example.test/oversized' },
      { title: 'Unsafe private fixture', url: 'javascript:alert(1)' },
      { title: 'Invalid URL private fixture', url: 'invalid' },
    ] }) });
    const response = await h.get(query);
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { status: 'unavailable', briefs: [], message: 'AI summaries are temporarily unavailable. Please try again.' });
    assert.equal(h.calls.length, 1); assert.ok(h.calls[0].url.includes('/api/news'));
    assert.equal(h.timers.size, 0);
  });

  test(`genuinely empty news stays successful without AI work (${query || 'normal'})`, async () => {
    const h = harness({ fetcher: async () => Response.json({ articles: [] }) });
    const response = await h.get(query);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), query
      ? { status: 'debug', keyPresent: true, poolSize: 0, briefs: [] }
      : { status: 'ok', briefs: [] });
    assert.equal(h.calls.length, 1); assert.ok(h.calls[0].url.includes('/api/news'));
    assert.equal(h.timers.size, 0);
  });
}

const responseWith = briefs => Response.json({ choices: [{ message: { content: JSON.stringify({ briefs }) } }] });
const groundedArticle = { title: 'DoorDash bid could be announced Thursday, sources say', description: 'The companies remain in talks; an announcement is possible, not a completed acquisition.', url: 'https://example.test/doordash', source: { name: 'News source' } };
function groundedHarness(articles, selections, inspect = () => {}) {
  return harness({ fetcher: async (url, options) => {
    if (url.includes('/api/news')) return Response.json({ articles });
    inspect(JSON.parse(options.body));
    return responseWith(selections);
  } });
}
test('original qualifiers, announcement wording and attribution survive fabricated model prose', async () => {
  const h = groundedHarness([groundedArticle], [{ articleId: selectedId(groundedArticle.url), headline: 'DoorDash will acquire Instacart', summary: 'The acquisition will complete Thursday.', sources: [{ name: 'Forged', url: 'https://evil.test' }], indices: [0, 1] }], body => {
    const candidates = JSON.parse(body.messages[0].content.split('Articles:\n')[1]);
    assert.equal(candidates[0].description, groundedArticle.description);
  });
  const response = await h.get(); const [brief] = (await response.json()).briefs;
  assert.equal(brief.headline, groundedArticle.title); assert.equal(brief.summary, groundedArticle.description);
  assert.deepEqual(brief.sources, [{ name: 'News source', url: groundedArticle.url }]);
});
test('unrelated display supply-chain article cannot be cited for a DoorDash rewrite', async () => {
  const display = { title: 'Display supply chain starts investor briefings', description: 'Panel manufacturers discuss new businesses.', url: 'https://example.test/displays', source: { name: 'Display publisher' } };
  const h = groundedHarness([groundedArticle, display], [{ articleId: selectedId(display.url), headline: groundedArticle.title, summary: 'DoorDash will buy Instacart.', indices: [0, 1] }]);
  const [brief] = (await (await h.get()).json()).briefs;
  assert.equal(brief.headline, display.title); assert.equal(brief.summary, display.description);
  assert.deepEqual(brief.sources, [{ name: 'Display publisher', url: display.url }]);
});
for (const selection of [{ indices: [0, 1], headline: 'DoorDash to acquire Instacart', summary: 'Deal finalizing Thursday.' }, { articleId: 'invented' }, { articleId: 0 }, null, 'invalid']) {
  test(`unbound selection is rejected: ${JSON.stringify(selection)}`, async () => {
    const response = await groundedHarness([groundedArticle], [selection]).get();
    assert.equal(response.status, 502); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual((await response.json()).briefs, []);
  });
}
test('duplicate and unknown IDs cannot create duplicate or extra source links', async () => {
  const id = selectedId(groundedArticle.url);
  const response = await groundedHarness([groundedArticle], [{ articleId: 'unknown' }, { articleId: id }, { articleId: id }]).get();
  const briefs = (await response.json()).briefs;
  assert.equal(briefs.length, 1); assert.equal(briefs[0].sources.length, 1);
});
test('same publisher on different stories retains the correct URL per brief', async () => {
  const other = { ...groundedArticle, title: 'Another independent story', url: 'https://example.test/other' };
  const response = await groundedHarness([groundedArticle, other], [{ articleId: selectedId(other.url) }, { articleId: selectedId(groundedArticle.url) }]).get();
  assert.deepEqual((await response.json()).briefs.map(b => b.sources[0].url), [other.url, groundedArticle.url]);
});
test('malformed pool rows, unsafe URLs and duplicate stories do not shift source identity', async () => {
  const articles = [null, 1, { title: 'Unsafe', url: 'javascript:alert(1)' }, groundedArticle, groundedArticle];
  const response = await groundedHarness(articles, [{ articleId: selectedId(groundedArticle.url) }], body => {
    assert.equal(JSON.parse(body.messages[0].content.split('Articles:\n')[1]).length, 1);
  }).get();
  assert.equal((await response.json()).briefs[0].sources[0].url, groundedArticle.url);
});
for (const description of [undefined, {}, 'x'.repeat(1201)]) test('missing or oversized description uses the complete qualified headline', async () => {
  const response = await groundedHarness([{ ...groundedArticle, description }], [{ articleId: selectedId(groundedArticle.url) }]).get();
  assert.equal((await response.json()).briefs[0].summary, groundedArticle.title);
});
