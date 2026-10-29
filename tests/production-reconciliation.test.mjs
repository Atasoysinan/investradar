import { newsArticles } from '../lib/newsProvider.ts';
import { loadDataRequest } from './support/data-request.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import ts from 'typescript';

function route(path, env, fetcher = async () => { throw new Error('Unexpected external request'); }) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, URL, Date, AbortController, setTimeout, clearTimeout, process: { env }, fetch: fetcher,
    require: name => {
      if (name === '@/lib/newsProvider') return { newsArticles };
        if (name === '@/lib/dataRateLimit') return { checkDataRateLimit: async () => null };
      if (name === '@/lib/dataRequest') return loadDataRequest(fetcher);
      if (name === '@/lib/briefsRateLimit') return { getBriefsRateLimit: () => ({ limit: async () => 0 }) };
      if (name === '@/lib/marketQuotes') return { fetchMarketQuote() { throw new Error('Must not access market provider'); }, marketQuoteList() { throw new Error('Must not build market response'); } };
      if (name === 'next/server') return { NextResponse: Response };
      if (name === 'node:crypto') return { createHash };
      if (name === 'node:net') return { isIP };
      if (name === 'resend') return { Resend: class { constructor() { throw new Error('Must not initialize email provider'); } } };
      if (name === '@/lib/subscriptionRateLimit') return { getSubscriptionRateLimit() { throw new Error('Must not initialize Redis'); } };
      throw new Error(`Non-production isolation failed: ${name}`);
    },
  });
  return exports;
}

for (const environment of [undefined, 'preview', 'development']) {
  test(`briefs in ${environment ?? 'unconfigured'} environment cannot call production news or AI`, async () => {
    const api = route('app/api/briefs/route.ts', { VERCEL_ENV: environment, GROQ_API_KEY: 'test-key' });
    const response = await api.GET(new Request('https://example.test/api/briefs'));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    assert.equal(body.status, 'unavailable'); assert.deepEqual(body.briefs, []);
  });
}

test('production briefs preserve configured model and JSON-object response format', async () => {
  let body;
  const api = route('app/api/briefs/route.ts', { VERCEL_ENV: 'production', GROQ_API_KEY: 'test-key', GROQ_MODEL: 'configured-model' }, async (url, options) => {
    if (String(url).includes('/api/news')) return Response.json({ articles: Array.from({ length: 6 }, (_, i) => ({ title: `Headline ${i}`, url: `https://example.test/${i}`, description: '', source: { name: 'Example' } })) });
    body = JSON.parse(options.body);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ briefs: [{ articleId: JSON.parse(body.messages[0].content.split('Articles:\n')[1])[0].articleId }] }) } }] });
  });
  const response = await api.GET(new Request('https://example.test/api/briefs'));
  assert.equal(body.model, 'configured-model'); assert.equal(body.max_completion_tokens, 900);
  assert.equal(body.reasoning_effort, 'low'); assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.equal((await response.json()).briefs[0].headline, 'Headline 0');
});

for (const path of ['app/api/market/route.ts', 'app/api/sectors/route.ts']) {
  test(`${path}: absent credentials return controlled non-cacheable 503`, async () => {
    const api = route(path, {});
    const response = await api.GET(new Request('https://example.test/api/market'));
    assert.equal(response.status, 503); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).error, 'Market data service is not configured.');
  });
}

for (const environment of [undefined, 'preview', 'development']) {
  test(`subscriptions in ${environment ?? 'unconfigured'} environment are blocked before parsing or external access`, async () => {
    const api = route('app/api/subscribe/route.ts', { VERCEL_ENV: environment, NODE_ENV: 'production', RESEND_API_KEY: 'test-only' });
    const response = await api.POST(new Request('https://example.test/api/subscribe', { method: 'POST', headers: { 'x-vercel-env': 'production' }, body: '{invalid' }));
    assert.equal(response.status, 403); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match((await response.json()).error, /No email was sent and no subscription was saved/);
  });
}
