import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { newsArticles } from '../lib/newsProvider.ts';
import { decodeHtml } from './support/decode-html.mjs';

const source = readFileSync(new URL('../app/api/news/route.ts', import.meta.url), 'utf8');
const secret = 'private-credential-do-not-log';
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function load(providerHost, reply) {
  const exports = {}, logs = [];
  vm.runInNewContext(compiled, {
    exports, URL, Date, AbortController, clearTimeout,
    setTimeout: callback => setTimeout(callback, 20),
    console: { warn: (...args) => logs.push(JSON.parse(JSON.stringify(args))) },
    process: { env: { NEWSDATA_KEY: secret, MEDIASTACK_KEY: secret } },
    require: name => name === '@/lib/newsProvider' ? { newsArticles }
      : name === '@/lib/dataRateLimit' ? { checkDataRateLimit: async () => null }
      : name === '@/lib/decodeHtml' ? { decodeHtml } : { NextResponse: Response },
    fetch: async url => {
      const host = new URL(url).hostname;
      if (host === providerHost) return reply();
      if (host === 'newsdata.io') return Response.json({ results: [] });
      if (host === 'api.mediastack.com') return Response.json({ data: [] });
      return new Response('<rss><channel><item><title>Healthy fallback</title><link>https://example.test/news</link></item></channel></rss>');
    },
  });
  return { logs, run: () => exports.GET(new Request('https://example.test/api/news')) };
}
for (const [provider, host, field] of [['NewsData', 'newsdata.io', 'results'], ['Mediastack', 'api.mediastack.com', 'data']]) {
  for (const [label, reply, failure, httpStatus, providerCode] of [
    ['HTTP authentication failure', () => Response.json({ error: { code: 'invalid_access_key', message: secret } }, { status: 401 }), 'http_error', 401, 'invalid_access_key'],
    ['quota failure', () => Response.json({ error: { code: 'usage_limit_reached', info: secret } }, { status: 429 }), 'http_error', 429, 'usage_limit_reached'],
    ['provider error in HTTP 200', () => Response.json({ status: 'error', results: { code: 'Unauthorized', message: secret } }), 'provider_error', 200, 'Unauthorized'],
    ['unknown code that looks like a key', () => Response.json({ error: { code: secret, message: secret } }), 'provider_error', 200, null],
    ['malformed payload', () => Response.json({ [field]: {} }), 'invalid_response', 200, null],
    ['invalid JSON', () => new Response(secret), 'invalid_response', 200, null],
    ['non-JSON HTTP failure', () => new Response(secret, { status: 502 }), 'http_error', 502, null],
    ['transport failure', () => { throw new Error(`https://${host}/?apikey=${secret}`); }, 'network_error', null, null],
    ['request timeout', () => new Promise(() => {}), 'timeout', null, null],
    ['body timeout', () => ({ ok: true, status: 200, json: () => new Promise(() => {}) }), 'timeout', 200, null],
  ]) {
    test(`${provider}: safe log for ${label}, fallback survives`, async () => {
      const route = load(host, reply);
      const response = await route.run();
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('x-news-data-partial'), 'true');
      assert.ok((await response.json()).articles.length > 0);
      assert.deepEqual(route.logs, [['News provider request failed', { provider, failure, httpStatus, providerCode }]]);
      assert.ok(!JSON.stringify(route.logs).includes(secret));
      assert.ok(!JSON.stringify(route.logs).includes(host));
    });
  }
  test(`${provider}: valid empty response produces no error log`, async () => {
    const route = load(host, () => Response.json({ [field]: [] }));
    assert.equal((await route.run()).status, 200);
    assert.deepEqual(route.logs, []);
  });
}
