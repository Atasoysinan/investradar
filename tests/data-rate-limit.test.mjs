import { ETF_INFO, ETF_CATEGORIES } from '../lib/etfCatalog.ts';
import { newsArticles } from '../lib/newsProvider.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import ts from 'typescript';
const compile = path => ts.transpileModule(readFileSync(new URL('../'+path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function limiter({ result = 0, environment = 'production', platform = '1', configured = true, throws = false, held = false } = {}) {
  const calls = [], timers = new Map(); let next = 0;
  class Redis {
    constructor(options) { calls.push({ options }); }
    async eval(script, keys, args) { calls.push({ script, keys, args }); if (throws) throw new Error('private credentials'); return held ? new Promise(() => {}) : result; }
  }
  const exports = {};
  vm.runInNewContext(compile('lib/dataRateLimit.ts'), { exports, AbortSignal,
    process: { env: { VERCEL_ENV: environment, VERCEL: platform,
      ...(configured ? { KV_REST_API_URL: 'https://redis.test', KV_REST_API_TOKEN: 'test' } : {}) } },
    setTimeout(fn, ms) { timers.set(++next, { fn, ms }); return next; }, clearTimeout(id) { timers.delete(id); },
    require(name) {
      if (name === '@/lib/etfCatalog') return { ETF_INFO, ETF_CATEGORIES };
      if (name === '@/lib/newsProvider') return { newsArticles }; return name === '@upstash/redis' ? { Redis } : name === 'next/server' ? { NextResponse: Response }
      : name === 'node:crypto' ? { createHash } : { isIP }; },
  }); return { ...exports, calls, timers };
}
const request = (query = '', headers = {}) => new Request('https://example.test/api/market'+query, { headers });
test('admission uses hashed trusted IP, atomic weighted shared keys, and no SDK retries', async () => {
  const h = limiter(); assert.equal(await h.checkDataRateLimit(request('?q=anything', { 'x-vercel-forwarded-for': '203.0.113.1', 'x-forwarded-for': 'spoof' }), 'market', 30), null);
  assert.equal(h.calls[0].options.retry.retries, 0); assert.equal(h.calls[0].options.enableAutoPipelining, false);
  const call = h.calls[1]; assert.ok(call.keys[0].endsWith(createHash('sha256').update('203.0.113.1').digest('hex')));
  assert.equal(call.keys[1], 'investradar:data:v1:production:market:global');
  assert.deepEqual(Array.from(call.args), [30, 240, 1200]); assert.ok(call.script.includes("redis.call('INCRBY'")); assert.equal(h.timers.size, 0);
});
test('off-platform spoofed forwarding headers and changing queries cannot reset the shared bucket', async () => {
  const h = limiter({ platform: '0' });
  await h.checkDataRateLimit(request('?symbols=AAPL', { 'x-vercel-forwarded-for': '203.0.113.1' }), 'news');
  await h.checkDataRateLimit(request('?q=other', { 'x-forwarded-for': '203.0.113.2' }), 'news');
  assert.deepEqual(Array.from(h.calls[1].keys), Array.from(h.calls[3].keys));
});
for (const environment of ['production','preview','development',undefined]) {
  test(`namespace isolation: ${environment ?? 'unset'}`, async () => {
    const h = limiter({ environment: environment ?? '' }); await h.checkDataRateLimit(request(), 'news');
    assert.ok(h.calls[1].keys[0].includes(`:${environment === 'production' ? 'production' : environment === 'preview' ? 'preview' : 'development'}:news:`));
    assert.deepEqual(Array.from(h.calls[1].args), [1,30,300]);
  });
}
test('429 has Retry-After and no-store without leaking private information', async () => {
  const h = limiter({ result: 1201 }); const res = await h.checkDataRateLimit(request(), 'news');
  assert.equal(res.status,429); assert.equal(res.headers.get('Retry-After'),'2'); assert.equal(res.headers.get('cache-control'),'no-store'); assert.equal(h.timers.size,0);
});
for (const options of [{ configured:false },{throws:true},{result:-1},{result:NaN},{result:'0'}]) {
  test(`limiter failure is closed: ${JSON.stringify(options)}`, async () => {
    const h = limiter(options); const res = await h.checkDataRateLimit(request(), 'market');
    assert.equal(res.status,503); assert.equal(res.headers.get('Retry-After'),'30'); assert.equal(res.headers.get('cache-control'),'no-store');
    assert.ok(!JSON.stringify(await res.json()).includes('private')); assert.equal(h.timers.size,0);
  });
}
test('stalled Redis response has a three-second overall deadline', async () => {
  const h = limiter({ held:true }); const pending = h.checkDataRateLimit(request(), 'news');
  assert.equal([...h.timers.values()][0].ms,3000); [...h.timers.values()][0].fn(); assert.equal((await pending).status,503); assert.equal(h.timers.size,0);
});
const groups = { market:'market',etfs:'market',penny:'market',sectors:'market',crypto:'market',trending:'market',stocktwits:'market','stocktwits-feed':'market',news:'news','global-news':'news','topic-news':'news','breaking-news':'news' };
function route(name, blocked = false) {
  const admissions = [], providers = [], exports = {};
  vm.runInNewContext(compile(`app/api/${name}/route.ts`), { exports, URL, URLSearchParams, Date,
    process:{env:{FINNHUB_KEY:'test',NEWSAPI_KEY:'test',GNEWS_KEY:'test'}}, setTimeout(fn){fn();return 1;},
    require(name) {
      if (name === '@/lib/etfCatalog') return { ETF_INFO, ETF_CATEGORIES };
      if (name === '@/lib/newsProvider') return { newsArticles };
      if(name === 'next/server') return {NextResponse:Response};
      if(name === '@/lib/dataRateLimit') return { async checkDataRateLimit(req,group,cost){ admissions.push({req,group,cost}); return blocked ? Response.json({error:'Busy'},{status:429,headers:{'Retry-After':'10','Cache-Control':'no-store'}}):null; } };
      if(name === '@/lib/dataRequest') return {createDataRequest:()=>async()=>{providers.push('data');throw new Error('Unexpected provider');}};
      if(name === '@/lib/marketQuotes') return {fetchMarketQuote:async symbol=>{providers.push(symbol);return {c:125};},marketQuoteList:results=>Response.json(results.flatMap(r=>r.status==='fulfilled'?[r.value]:[]))};
      return {};
    }, fetch(){providers.push('fetch');throw new Error('Unexpected provider');},
  });return { ...exports,admissions,providers };
}
for(const [name,group] of Object.entries(groups)) {
  test(`${name}: throttling precedes any provider call and dynamic route cannot cache around admission`, async()=>{
    const h=route(name,true);const res=await h.GET(request('?symbols=AAPL'));
    assert.equal(res.status,429);assert.equal(h.admissions[0].group,group);assert.deepEqual(h.providers,[]);assert.equal(h.dynamic,'force-dynamic');
  });
}
for(const query of ['?symbols='+Array(31).fill('AAPL').join(','),'?symbols='+('A'.repeat(480)), '?symbol=AAPL&type=index-quotes','?symbol=AAPL&type=multi-quote&symbols=A,B,C,D,E','?symbols=AAPL,,MSFT','?symbols=AAPL&symbols=MSFT','?symbol=AAPL&symbol=MSFT','?symbol='+('A'.repeat(16)),'?symbols=../../etc','?symbols=','?type=multi-quote','?type=multi-quote&symbols=A,B,C,D,E,F']) {
 test(`reject invalid/big symbol list before admission or provider: ${query.slice(0,75)}`,async()=>{
  const h=route('market');const res=await h.GET(request(query));assert.equal(res.status,400);assert.equal(h.admissions.length,0);assert.deepEqual(h.providers,[]);
 });
}
test('30 valid symbols are accepted and charged; duplicates normalized without repeated work',async()=>{
 const h=route('market');const symbols=Array.from({length:30},(_,i)=>('T'+i).padEnd(15,'A'));
 assert.equal((await h.GET(request('?symbols='+symbols.join(',')))).status,200);assert.equal(h.admissions[0].cost,30);assert.equal(h.providers.length,30);
 const other=route('market');await other.GET(request('?symbols=aapl,AAPL,msft'));assert.deepEqual(other.providers,['AAPL','MSFT']);assert.equal(other.admissions[0].cost,2);
});
test('multi-quote accepts exactly five valid symbols and company news shares news quota',async()=>{
 const h=route('market');assert.equal((await h.GET(request('?type=multi-quote&symbols=A,B,C,D,E'))).status,200);assert.equal(h.admissions[0].cost,5);
 const news=route('market',true);await news.GET(request('?symbol=AAPL&type=news'));assert.equal(news.admissions[0].group,'news');assert.equal(news.admissions[0].cost,1);
});
