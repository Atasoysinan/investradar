import { newsArticles } from '../../lib/newsProvider.ts';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const root = new URL('../../', import.meta.url);
function compile(path, context) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, root), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, ...context });
  return exports;
}
export function loadRowRoute(name, read, limited = null, env = { NEWSAPI_KEY: 'fixture', FINNHUB_KEY: 'fixture', GNEWS_KEY: 'fixture' }) {
  const calls = [];
  const fetcher = async (...args) => { calls.push(args); return read(...args); };
  const social = compile('lib/socialData.ts', {});
  const decoder = compile('lib/decodeHtml.ts', {});
  const route = compile(`app/api/${name}/route.ts`, {
    URL, URLSearchParams, Date, AbortController, setTimeout, clearTimeout,
    fetch: async (...args) => { const value = await fetcher(...args); return value instanceof Response ? value : Response.json(value); },
    process: { env },
    require(key) {
      if (key.endsWith('decodeHtml')) return decoder;
      if (key.endsWith('newsProvider')) return { newsArticles };
      if (key === 'next/server') return { NextResponse: Response };
      if (key.endsWith('dataRateLimit')) return { checkDataRateLimit: async () => limited };
      if (key.endsWith('dataRequest')) return { fetchJson: fetcher, createDataRequest: () => fetcher };
      if (key.endsWith('socialData')) return social;
      throw new Error(key);
    },
  });
  return { calls, run: () => route.GET(new Request(`http://localhost/api/${name}`)) };
}
export const healthyArticle = { title: 'Healthy market news', url: 'https://example.com/news', description: 'News', publishedAt: '2026-10-27T00:00:00Z', urlToImage: '', source: { name: 'Fixture' } };
export function mixedProvider(url) {
  if (url.includes('newsapi.org')) return { articles: [null, 1, {}, { title: 2 }, { ...healthyArticle, source: { name: new URL(url).searchParams.get('q') } }] };
  if (url.includes('yahoo')) return { finance: { result: [{ quotes: [null, 4, {}, { symbol: {} }, { symbol: 'AAPL' }, { symbol: 'BTC-USD' }] }] } };
  if (url.includes('reddit')) return { data: { children: [null, {}, { data: { title: '$AAPL news', score: 0, subreddit: 'stocks', permalink: '/r/stocks/1' } }] } };
  if (url.includes('/coins/markets')) return [null, {}, { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: null, price_change_percentage_24h: null }];
  if (url.includes('/simple/price')) return { bitcoin: null };
  return { c: 123, dp: 0 };
}
