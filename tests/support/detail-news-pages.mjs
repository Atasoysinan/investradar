import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
export function detailNewsPage({ news = { articles: [] }, reject = false, missingKey = false, blocked = false } = {}) {
  const modules = new Map(), calls = [];
  const read = async url => {
    calls.push(url);
    if (url.includes('newsapi')) { if (reject) throw new Error('private provider timeout or network details'); return news; }
    if (url.includes('coingecko')) return { name: 'Bitcoin', symbol: 'btc', image: { large: '/globe.svg' }, market_data: { current_price: { usd: 65000 }, price_change_percentage_24h: 0 } };
    if (url.includes('/quote?')) return { c: 125, d: 0, dp: 0, h: 130, l: 120, pc: 124 };
    return { name: 'Apple', exchange: 'NASDAQ' };
  };
  function load(path) {
    if (modules.has(path)) return modules.get(path);
    const exports = {}; modules.set(path, exports);
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../' + path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
      exports, Request, URL, Date, process: { env: { FINNHUB_KEY: 'fixture', ...(!missingKey && { NEWSAPI_KEY: 'fixture' }) } },
      require(name) {
        if (name === 'react') return { cache: fn => fn };
        if (name === 'react/jsx-runtime') return require(name);
        if (name === 'next/headers') return { headers: async () => new Headers() };
        if (name === '@/lib/dataRateLimit') return { checkDataRateLimit: async (_request, group) => blocked && group === 'news' ? new Response(null, { status: 429 }) : null };
        if (name === '@/lib/dataRequest') return { createDataRequest: () => read };
        if (name.startsWith('@/lib/')) return load(name.replace('@/', '') + '.ts');
        if (name === 'next/image') return { default: ({ unoptimized: _u, fill: _f, priority: _p, ...props }) => { void _u; void _f; void _p; return require('react').createElement('img', props); } };
        if (name === 'next/link') return { default: props => require('react').createElement('a', props) };
        throw new Error(name);
      },
    }); return exports;
  }
  return { calls, load, async render(kind) {
    const page = load(kind === 'stock' ? 'app/stocks/[ticker]/page.tsx' : 'app/crypto/[id]/page.tsx');
    const tree = await page.default({ params: Promise.resolve(kind === 'stock' ? { ticker: 'AAPL' } : { id: 'bitcoin' }) });
    return require('react-dom/server').renderToStaticMarkup(tree);
  } };
}
