import { ETF_INFO } from '../lib/etfCatalog.ts';
import { loadDataRequest } from './support/data-request.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const quote = { c: 125, d: 0, dp: 0, h: 130, l: 120, o: 125, pc: 125 };
function route(path, fetcher) {
  const modules = new Map();
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const exports = {}; modules.set(file, exports);
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, {
      exports, URL, Date, process: { env: { FINNHUB_KEY: 'test-only-key' } }, fetch: fetcher,
      setTimeout(callback) { callback(); return 1; },
      require(name) {
        if (name === '@/lib/etfCatalog') return { ETF_INFO };
        if (name === '@/lib/dataRateLimit') return { checkDataRateLimit: async () => null };
        if (name === '@/lib/dataRequest') return loadDataRequest(fetcher);
        if (name === 'next/server') return { NextResponse: Response };
        if (name === '@/lib/marketQuotes') return load('lib/marketQuotes.ts');
        throw new Error(`Unexpected dependency: ${name}`);
      },
    });
    return exports;
  }
  return load(path);
}
const endpoints = [
  ['market', '?symbols=AAPL,MSFT'], ['market', '?type=index-quotes&tab=sp500'],
  ['market', '?type=index-quotes&tab=nasdaq'], ['market', '?type=multi-quote&symbols=AAPL,MSFT'],
  ['market', '?symbol=AAPL'], ['penny', ''], ['etfs', ''], ['sectors', ''],
];

for (const [name, query] of endpoints) {
  for (const [failure, fetcher] of [
    ['HTTP 429', async () => Response.json({ error: 'private provider quota detail' }, { status: 429 })],
    ['HTTP 500', async () => Response.json(quote, { status: 500 })],
    ['network error', async () => { throw new Error('private provider credentials'); }],
    ['invalid JSON', async () => new Response('{broken')],
  ]) {
    test(`${name}${query}: ${failure} returns non-cacheable failure, never zero quotes`, async () => {
      const api = route(`app/api/${name}/route.ts`, fetcher);
      const response = await api.GET(new Request(`https://example.test/api/${name}${query}`));
      assert.equal(response.status, 502);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await response.json(), { error: 'Market data is temporarily unavailable. Please try again.' });
    });
  }
}

for (const invalid of [{}, null, { ...quote, error: 'invalid symbol' }, { ...quote, dp: null },
  { ...quote, c: '125' }, { ...quote, c: 0 }, { ...quote, pc: undefined }, { ...quote, d: Infinity }]) {
  test(`invalid HTTP 200 quote is rejected: ${JSON.stringify(invalid)}`, async () => {
    const api = route('app/api/market/route.ts', async () => Response.json(invalid));
    const response = await api.GET(new Request('https://example.test/api/market?symbols=AAPL'));
    assert.equal(response.status, 502);
  });
}

for (const [name, query] of endpoints.filter(([, query]) => query !== '?symbol=AAPL')) {
  test(`${name}${query}: partial results omit failed symbols and identify missing data`, async () => {
    let calls = 0;
    const api = route(`app/api/${name}/route.ts`, async () => ++calls === 1
      ? Response.json(quote) : Response.json({ error: 'provider unavailable' }, { status: 429 }));
    const response = await api.GET(new Request(`https://example.test/api/${name}${query}`));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-market-data-partial'), 'true');
    const rows = await response.json(); assert.equal(rows.length, 1);
    assert.equal(rows[0].c ?? rows[0].price, 125);
    assert.equal(rows[0].dp ?? rows[0].changePercent, 0);
  });
}

test('complete valid quotes retain genuine zero changes without partial warning', async () => {
  const api = route('app/api/market/route.ts', async () => Response.json(quote));
  const response = await api.GET(new Request('https://example.test/api/market?symbols=AAPL,MSFT'));
  assert.equal(response.status, 200); assert.equal(response.headers.get('x-market-data-partial'), null);
  const rows = await response.json(); assert.equal(rows.length, 2);
  assert.ok(rows.every(row => row.c === 125 && row.d === 0 && row.dp === 0));
});
