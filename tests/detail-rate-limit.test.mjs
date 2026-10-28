import { Redis } from '@upstash/redis';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function harness({blocked='',unavailable=false,throws=false,headerThrows=false,providerFailure=false}={}){
 const modules=new Map(),caches=[],admissions=[],providers=[];let headerCalls=0;
 const read=async url=>{providers.push(url);if(providerFailure)throw new Error('private provider error');
  return url.includes('coingecko')?{name:'Bitcoin',symbol:'btc',image:null,market_data:{current_price:{usd:65000},price_change_percentage_24h:0}}
   :url.includes('/quote?')?{c:125,d:0,dp:0,h:130,l:120,pc:124}
   :url.includes('profile2?')?{name:'Apple'}:{articles:[]};
 };
 function load(file){if(modules.has(file))return modules.get(file);const exports={};modules.set(file,exports);
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{
   compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
  }).outputText,{exports,Request,URL,Date,process:{env:{FINNHUB_KEY:'test',NEWSAPI_KEY:'test'}},require(name){
   if(name==='react')return{cache(fn){const cache=new Map();caches.push(cache);return(...args)=>{const key=JSON.stringify(args);if(!cache.has(key))cache.set(key,fn(...args));return cache.get(key);};}};
   if(name==='next/headers')return{async headers(){headerCalls++;if(headerThrows)throw new Error('private context error');return new Headers({'x-vercel-forwarded-for':'203.0.113.1','x-forwarded-for':'spoof','cookie':'private-cookie'});}};
   if(name==='@/lib/dataRateLimit')return{async checkDataRateLimit(request,group,cost){admissions.push({request,group,cost});if(throws)throw new Error('private Redis error');return unavailable?Response.json({error:'private'},{status:503}):blocked===group?Response.json({error:'private'},{status:429}):null;}};
   if(name==='@/lib/dataRequest')return{createDataRequest:()=>read};
   if(name==='react/jsx-runtime')return{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
   if(name.startsWith('@/lib/'))return load(name.replace('@/','')+'.ts');return{default:'a'};
  }});return exports;
 }
 return{load,admissions,providers,headerCalls:()=>headerCalls,newRequest(){caches.forEach(cache=>cache.clear());}};
}
function text(node){if(node==null||typeof node==='boolean')return'';if(Array.isArray(node))return node.map(text).join(' ');return typeof node==='object'?text(node.props?.children):String(node);}
const stockArgs=ticker=>({params:Promise.resolve({ticker})}),coinArgs=id=>({params:Promise.resolve({id})});
test('stock admits two market units and one news unit before their respective provider calls',async()=>{
 const h=harness();const page=h.load('app/stocks/[ticker]/page.tsx');assert.equal(page.dynamic,'force-dynamic');
 const tree=await page.default(stockArgs('AAPL'));assert.ok(text(tree).includes('$125.00'));
 assert.deepEqual(h.admissions.map(a=>[a.group,a.cost]),[['market',2],['news',1]]);assert.equal(h.providers.length,3);
 assert.equal(h.headerCalls(),1);for(const {request}of h.admissions){assert.equal(request.headers.get('x-vercel-forwarded-for'),'203.0.113.1');assert.equal(request.headers.get('x-forwarded-for'),null);assert.equal(request.headers.get('cookie'),null);}
});
for(const kind of ['stock','crypto'])for(const failure of ['limited','unavailable','throw','headers'])test(`${kind}: ${failure} closes admission without provider or news work`,async()=>{
 const h=harness({blocked:failure==='limited'?'market':'',unavailable:failure==='unavailable',throws:failure==='throw',headerThrows:failure==='headers'});
 const page=h.load(kind==='stock'?'app/stocks/[ticker]/page.tsx':'app/crypto/[id]/page.tsx');
 const tree=await page.default(kind==='stock'?stockArgs('AAPL'):coinArgs('bitcoin'));assert.equal(h.providers.length,0);
 assert.ok(text(tree).includes(failure==='limited'?'Too many data requests.':'Data service is temporarily unavailable.'));assert.ok(!text(tree).includes('private'));
 if(kind==='crypto'){const metadata=await page.generateMetadata(coinArgs('bitcoin'));assert.ok(metadata.description.includes('unavailable'));assert.ok(!metadata.description.includes('$0'));assert.equal(h.providers.length,0);}
});
for(const kind of ['stock','crypto'])test(`${kind}: news quota cannot be bypassed, while healthy prices remain visible`,async()=>{
 const h=harness({blocked:'news'});const page=h.load(kind==='stock'?'app/stocks/[ticker]/page.tsx':'app/crypto/[id]/page.tsx');
 const tree=await page.default(kind==='stock'?stockArgs('AAPL'):coinArgs('bitcoin'));
 assert.ok(text(tree).includes(kind==='stock'?'$125.00':'$65,000.00'));assert.ok(text(tree).includes('Too many data requests.'));assert.ok(!h.providers.some(url=>url.includes('newsapi')));
});
test('crypto metadata and page share admission/provider data in either execution order',async()=>{
 for(const metadataFirst of [true,false]){
  const h=harness();const page=h.load('app/crypto/[id]/page.tsx');assert.equal(page.dynamic,'force-dynamic');
  if(metadataFirst)await Promise.all([page.generateMetadata(coinArgs('bitcoin')),page.default(coinArgs('bitcoin'))]);
  else await Promise.all([page.default(coinArgs('bitcoin')),page.generateMetadata(coinArgs('bitcoin'))]);
  assert.deepEqual(h.admissions.map(a=>[a.group,a.cost]),[['market',1],['news',1]]);assert.equal(h.providers.filter(url=>url.includes('coingecko')).length,1);
 }
});
test('React render cache cannot grant admission to the next request',async()=>{
 const h=harness();const page=h.load('app/crypto/[id]/page.tsx');await page.generateMetadata(coinArgs('bitcoin'));h.newRequest();await page.generateMetadata(coinArgs('bitcoin'));
 assert.equal(h.admissions.length,2);assert.equal(h.providers.length,2);
});
test('alternate crypto IDs and stock symbols still use the same quota groups',async()=>{
 const h=harness();const page=h.load('app/crypto/[id]/page.tsx');await page.generateMetadata(coinArgs('bitcoin'));await page.generateMetadata(coinArgs('ethereum'));
 await h.load('app/stocks/[ticker]/page.tsx').default(stockArgs('AAPL'));assert.deepEqual(h.admissions.map(a=>a.group),['market','market','market','news']);
 assert.ok(h.admissions.every(a=>a.request.headers.get('x-vercel-forwarded-for')==='203.0.113.1'));
});
test('provider failures remain controlled after admission and do not trigger unguarded retries',async()=>{
 const h=harness({providerFailure:true});const page=h.load('app/crypto/[id]/page.tsx');await page.generateMetadata(coinArgs('bitcoin'));const tree=await page.default(coinArgs('bitcoin'));
 assert.ok(text(tree).includes('Could not load data'));assert.equal(h.providers.filter(url=>url.includes('coingecko')).length,1);assert.deepEqual(h.admissions.map(a=>a.group),['market','news']);
});
test('provider URL path/query cannot be changed by an encoded route parameter',async()=>{
 const h=harness();await h.load('app/stocks/[ticker]/page.tsx').default(stockArgs('AAPL&token=spoof'));
 assert.equal(new URL(h.providers[0]).searchParams.get('symbol'),'AAPL&TOKEN=SPOOF');assert.equal(new URL(h.providers[0]).searchParams.getAll('token').length,1);
});


test('installed Redis SDK makes exactly one admission attempt on network failure',async()=>{
 const originalFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw new Error('controlled network failure');};
 try{
  const exports={};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/dataRateLimit.ts',import.meta.url),'utf8'),{
   compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText,{exports,Request,AbortSignal,setTimeout,clearTimeout,process:{env:{KV_REST_API_URL:'https://redis.test',KV_REST_API_TOKEN:'test'}},require(name){return name==='@upstash/redis'?{Redis}:name==='node:crypto'?{createHash}:name==='node:net'?{isIP}:{NextResponse:Response};}});
  const response=await exports.checkDataRateLimit(new Request('https://example.test/detail'),'market',1);
  assert.equal(response.status,503);assert.equal(calls,1);
 }finally{globalThis.fetch=originalFetch;}
});
