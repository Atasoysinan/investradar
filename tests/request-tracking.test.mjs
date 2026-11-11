import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import proxyTesting from 'next/experimental/testing/server.js';
import { trafficBot, trafficEndpoint, trafficRecord, trafficLog } from '../lib/requestTracking.ts';
import { createTrafficReport } from '../scripts/report-traffic.mjs';

// This installed Next release still exports the matcher utility under its old name.
const { unstable_doesMiddlewareMatch } = proxyTesting;

const request = (path = '/api/news', ua = 'Mozilla/5.0') => ({
  nextUrl: { pathname: path }, method: 'GET', headers: new Headers({ 'user-agent': ua }),
});
const record = (path, ua, time = '2026-11-08T23:59:59Z', env = 'production') =>
  trafficRecord(request(path, ua), env, new Date(time));

test('traffic log has bounded labels and no raw paths, queries, headers or credentials', () => {
  const req = request('/api/auth/callback/private-secret', 'curl/8 private-secret');
  req.headers.set('authorization', 'Bearer private-secret');
  req.headers.set('cookie', 'session=private-secret');
  req.headers.set('x-forwarded-for', '192.0.2.44');
  req.method = 'PRIVATE-SECRET';
  const row = trafficRecord(req, 'private-secret', new Date('2026-11-08T12:00:00Z'));
  assert.deepEqual(row, { event: 'investradar.request', version: 1, day: '2026-11-08',
    environment: 'development', endpoint: '/api/auth/[...nextauth]', method: 'OTHER',
    bot: 'automation', kind: 'api', count: 1 });
  assert.ok(!JSON.stringify(row).includes('private-secret'));
  assert.ok(!JSON.stringify(row).includes('192.0.2.44'));
  assert.ok(!trafficLog(req, 'production').includes('private-secret'));
  assert.ok(!trafficLog(req, 'production').includes('192.0.2.44'));
  assert.equal(trafficEndpoint('/stocks/private-secret'), '/stocks/[ticker]');
  assert.equal(trafficEndpoint('/crypto/private-secret'), '/crypto/[id]');
  assert.equal(trafficEndpoint('/api/private-secret'), '/api/[other]');
  assert.equal(trafficEndpoint('/private-secret'), '/[other]');
  assert.equal(trafficEndpoint('/api/news/'), '/api/news');
});

for (const [ua, expected] of [
  ['Googlebot/2.1', 'google'], ['bingbot/2.0', 'bing'], ['GPTBot/1', 'ai-crawler'],
  ['ClaudeBot', 'ai-crawler'], ['SemrushBot', 'seo'], ['Twitterbot', 'social'],
  ['HeadlessChrome', 'automation'], ['python-requests/2', 'automation'], ['OtherSpider', 'other-bot'],
  ['Mozilla/5.0 Chrome/130 Safari/537.36', 'unclassified'], ['', 'unknown'], [null, 'unknown'],
]) test(`UA hint classification: ${ua}`, () => assert.equal(trafficBot(ua), expected));

test('request kind distinguishes prefetch/RSC traffic from navigation', () => {
  const req = request('/markets');
  assert.equal(trafficRecord(req).kind, 'page');
  req.headers.set('rsc', '1'); assert.equal(trafficRecord(req).kind, 'rsc');
  req.headers.set('next-router-prefetch', '1'); assert.equal(trafficRecord(req).kind, 'prefetch');
});

function proxyHarness(failLog = false) {
  const exports = {}, logs = [], passthrough = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, process: { env: { VERCEL_ENV: 'production' } },
    console: { info: line => { if (failLog) throw new Error('log unavailable'); logs.push(JSON.parse(line)); } },
    require: name => name === '@/lib/requestTracking' ? { trafficLog } : { NextResponse: { next: () => passthrough } },
  });
  return { ...exports, logs, passthrough };
}

test('proxy logs once and passes through unchanged even when logging fails', () => {
  const h = proxyHarness();
  assert.equal(h.proxy(request()), h.passthrough);
  assert.equal(h.logs.length, 1); assert.equal(h.logs[0][4], '/api/news');
  const broken = proxyHarness(true);
  assert.equal(broken.proxy(request()), broken.passthrough);
});

test('actual Next matcher covers API/pages while excluding static/image assets', () => {
  const { config } = proxyHarness();
  const matches = url => unstable_doesMiddlewareMatch({ config, nextConfig: {}, url });
  for (const path of ['/stocks/BRK.B', '/crypto/bitcoin', '/api/news?q=secret',
    '/api/auth/callback/google', '/api/unknown.json', '/random-probe']) {
    assert.equal(matches(path), true, path);
  }
  for (const path of ['/_next/static/chunk.js', '/_next/image?url=secret', '/favicon.ico', '/next.svg']) {
    assert.equal(matches(path), false, path);
  }
});

test('dotted bot probes reach tracking and collapse into anonymous labels', () => {
  const h = proxyHarness();
  for (const path of ['/wp-login.php', '/.env', '/.env.local', '/.git/config', '/xmlrpc.php',
    '/backup.zip', '/config.json', '/logo.png', '/nested/favicon.ico', '/next.svg.php', '/next.svg/probe.php',
    '/api', '/api/probe.php', '/stocks/BRK.B', '/%2eenv']) {
    assert.equal(unstable_doesMiddlewareMatch({ config: h.config, nextConfig: {}, url: path }), true, path);
    assert.equal(h.proxy(request(path, 'curl/8')), h.passthrough);
    const row = h.logs.at(-1);
    assert.equal(row[6], 'automation');
    assert.equal(row[4], path.startsWith('/api/') ? '/api/[other]'
      : path.startsWith('/stocks/') ? '/stocks/[ticker]' : '/[other]');
  }
  assert.ok(!JSON.stringify(h.logs).includes('wp-login.php'));
  assert.ok(!JSON.stringify(h.logs).includes('.env'));
});

test('ordinary light-page navigation, RSC and prefetch avoid Proxy; bot hints retain coverage', () => {
  const { config } = proxyHarness();
  for (const path of ['/', '/markets', '/videos', '/robots.txt', '/sitemap.xml', '/markets/']) {
    for (const headers of [{}, { 'user-agent': 'Mozilla/5.0 Chrome/130 Safari/537.36' },
      { 'user-agent': 'Mozilla/5.0', rsc: '1' }, { 'next-router-prefetch': '1' }]) {
      assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path, headers }), false, path);
    }
    for (const ua of ['Googlebot', 'GOOGLEBOT', 'bingpreview', 'GPTBot', 'ChatGPT-User', 'anthropic-ai',
      'SemrushBot', 'AhrefsBot', 'facebookexternalhit', 'Twitterbot', 'HeadlessChrome', 'Playwright',
      'Puppeteer', 'python-requests/2', 'python-httpx/1', 'curl/8', 'Go-http-client/1', 'Slurp', 'OtherSpider']) {
      assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path,
        headers: { 'user-agent': ua } }), true, `${path} ${ua}`);
    }
  }
  for (const path of ['/markets/probe.php', '/videos.php', '/sitemap.xml.bak', '/stocks/AAPL', '/api/news']) {
    assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path }), true, path);
  }
});

test('compact logs preserve dimensions and cut serialized byte size without batching or sampling counts', () => {
  const now = new Date('2026-11-09T00:00:00Z');
  const row = trafficRecord(request(), 'production', now);
  const compact = trafficLog(request(), 'production', now);
  assert.deepEqual(JSON.parse(compact), ['ir.req', 2, row.day, row.environment, row.endpoint, row.method, row.bot, row.kind]);
  assert.ok(Buffer.byteLength(compact) < Buffer.byteLength(JSON.stringify(row)) * 0.6);
  const report = createTrafficReport();
  for (let i = 0; i < 123; i++) report.add(compact);
  assert.equal(report.result().accepted, 123);
  assert.equal(report.result().daily[0].requests, 123);
});

test('report reads compact envelopes and keeps full and selective coverage separate on the same UTC day', () => {
  const report = createTrafficReport(), now = new Date('2026-11-08T12:00:00Z');
  report.add(JSON.stringify(record('/api/news', 'Googlebot')));
  report.add(trafficLog(request('/api/news', 'Googlebot'), 'production', now));
  report.add(JSON.stringify({ message: trafficLog(request('/api/news', 'Googlebot'), 'production', now) }));
  assert.equal(report.result().accepted, 3);
  assert.deepEqual(report.result().daily.map(x=>[x.coverage,x.requests]).sort(), [['full-v1',1],['selective-v2',2]]);
  assert.equal(report.result().breakdown.length, 2);
});

test('malformed compact records are rejected without reporting untrusted dimensions', () => {
  const report = createTrafficReport(), good = JSON.parse(trafficLog(request(), 'production'));
  for (const bad of [good.slice(0, 7), [...good, 'private-secret'], ['ir.req',3,...good.slice(2)],
    good.map((x,i)=>i===4?'private-secret':x), good.map((x,i)=>i===2?'2026-02-30':x)]) report.add(JSON.stringify(bad));
  assert.equal(report.result().accepted, 0); assert.equal(report.result().ignored, 5);
  assert.ok(!JSON.stringify(report.result()).includes('private-secret'));
});

test('every shipped static asset remains outside proxy tracking, including with queries', () => {
  const { config } = proxyHarness();
  const files = readdirSync(new URL('../public/', import.meta.url), { recursive: true, withFileTypes: true });
  for (const file of files.filter(entry => entry.isFile())) {
    const root = fileURLToPath(new URL('../public/', import.meta.url));
    const path = '/' + relative(root, join(file.parentPath, file.name)).split('\\').join('/');
    for (const suffix of ['', '?v=123']) assert.equal(
      unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path + suffix }), false, path + suffix);
  }
  assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: '/favicon.ico?v=123' }), false);
});

test('daily report separates UTC days and environments with endpoint/bot dimensions', () => {
  const report = createTrafficReport();
  const first = record('/api/news', 'Googlebot');
  report.add(JSON.stringify(first));
  report.add(JSON.stringify({ message: JSON.stringify(first) }));
  report.add(JSON.stringify(record('/api/market', 'curl/8', '2026-11-09T00:00:00Z')));
  report.add(JSON.stringify(record('/api/news', '', '2026-11-08T12:00:00Z', 'preview')));
  const result = report.result();
  assert.equal(result.accepted, 4); assert.equal(result.ignored, 0);
  assert.equal(result.daily.length, 3);
  assert.equal(result.daily.find(x => x.day === '2026-11-08' && x.environment === 'production').requests, 2);
  assert.equal(result.breakdown.find(x => x.bot === 'google').requests, 2);
  assert.equal(result.breakdown.find(x => x.bot === 'automation').endpoint, '/api/market');
});

test('report ignores unrelated/malformed records without echoing their contents', () => {
  const report = createTrafficReport(), good = record('/api/news', 'Googlebot');
  for (const line of ['private-secret', 'null', '{}', JSON.stringify({ message: 'private-secret' }),
    JSON.stringify({ ...good, count: 99 }), JSON.stringify({ ...good, endpoint: '/private-secret' }),
    JSON.stringify({ ...good, bot: 'private-secret' }), JSON.stringify({ ...good, day: '2026-99-99' })]) report.add(line);
  const { budget, ...counts } = report.result();
  assert.deepEqual(counts, { timezone: 'UTC', accepted: 0, ignored: 8, daily: [], breakdown: [] });
  assert.deepEqual(budget.daily, []);
});
