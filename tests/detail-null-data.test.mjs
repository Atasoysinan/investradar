import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function module(path, read) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
  }).outputText,{exports,URL,Date,process:{env:{}},require(name){
    if(name==='@/lib/detailData')return module('lib/detailData.ts',read);
    if(name==='@/lib/detailRequests')return{
      loadStockMarket:async symbol=>({quote:await read('https://finnhub.io/api/v1/quote?symbol='+symbol),profile:await read('https://finnhub.io/api/v1/stock/profile2?symbol='+symbol),read,issue:''}),
      loadCryptoMarket:async id=>({data:await read('https://api.coingecko.com/api/v3/coins/'+id),read,issue:''}),
      loadDetailNews:async(query,reader)=>({data:await reader('https://newsapi.org/v2/everything?q='+encodeURIComponent(query)),issue:''}),
    };
    if(name==='react/jsx-runtime')return{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
    return{default:name==='next/image'?'img':'a'};
  }});return exports;
}
function text(node){if(node==null||typeof node==='boolean')return'';if(Array.isArray(node))return node.map(text).join(' ');return typeof node==='object'?text(node.props?.children):String(node);}
function nodes(node){if(!node||typeof node!=='object')return[];if(Array.isArray(node))return node.flatMap(nodes);return[node,...nodes(node.props?.children)];}
const quote={c:125,d:0,dp:0,h:130,l:120,pc:124};
const coin={id:'bitcoin',name:'Bitcoin',symbol:'btc',image:{large:'https://example.test/coin.png'},market_data:{current_price:{usd:65000},price_change_percentage_24h:0,market_cap:{usd:1e9},total_volume:{usd:1e6},circulating_supply:0,ath:{usd:70000}}};
const news={articles:[null,{}, {title:'Healthy provider story',url:'https://example.test/news',description:null,publishedAt:'invalid',source:null,urlToImage:{}},{title:{bad:true},url:'https://example.test/bad'}]};
async function stock(value,profile=null,stories=news){return module('app/stocks/[ticker]/page.tsx',async url=>url.includes('/quote?')?value:url.includes('profile2?')?profile:stories).default({params:Promise.resolve({ticker:'AAPL'})});}
async function crypto(value,stories=news){return module('app/crypto/[id]/page.tsx',async url=>url.includes('coingecko')?value:stories).default({params:Promise.resolve({id:'bitcoin'})});}
for(const field of ['c','d','dp','h','l','pc']) {
 for(const invalid of [null,undefined,'125',{},NaN,Infinity])test(`stock ${field}: ${String(invalid)} cannot crash or discard healthy fields/news`,async()=>{
  const tree=await stock({...quote,[field]:invalid},{name:{},exchange:null,finnhubIndustry:42});const value=text(tree);
  assert.ok(value.includes('Healthy provider story'));assert.ok(value.includes('—'));assert.ok(!/NaN|Infinity|undefined|\[object Object\]/.test(value));
  if(field!=='c')assert.ok(value.includes('$125.00'));
 });
}
for(const value of [null,{},[],{error:'private provider error'}, {c:0,d:0,dp:0,h:0,l:0,pc:0}])test('stock absent/error quote remains readable without invented zero prices',async()=>{
 const valueText=text(await stock(value));assert.ok(valueText.includes('Price data is temporarily unavailable'));assert.ok(!valueText.includes('$0.00'));assert.ok(valueText.includes('Healthy provider story'));
});
test('stock valid zero changes are neutral and signed changes retain direction',async()=>{
 let tree=await stock(quote,{name:'Apple',exchange:'NASDAQ',finnhubIndustry:'Technology'});assert.ok(text(tree).includes('0.00%'));assert.ok(!text(tree).includes('▲'));assert.ok(nodes(tree).some(n=>n.props?.className==='text-gray-500'));
 tree=await stock({...quote,d:-1,dp:-2});assert.ok(text(tree).includes('-1.00'));assert.ok(text(tree).includes('▼ 2.00%'));
});
const paths=[['current_price','usd'],['price_change_percentage_24h'],['market_cap','usd'],['total_volume','usd'],['circulating_supply'],['ath','usd']];
for(const path of paths)for(const invalid of [null,undefined,'100',{},NaN,Infinity,-1]) {
 if(path[0]==='price_change_percentage_24h'&&invalid===-1)continue;
 test(`crypto ${path.join('.')}: ${String(invalid)} preserves remaining data`,async()=>{
  const value=structuredClone(coin);if(path.length===1)value.market_data[path[0]]=invalid;else value.market_data[path[0]][path[1]]=invalid;
  const tree=await crypto(value);const valueText=text(tree);assert.ok(valueText.includes('Bitcoin'));assert.ok(valueText.includes('—'));assert.ok(valueText.includes('Healthy provider story'));assert.ok(!/NaN|Infinity|undefined|\[object Object\]/.test(valueText));
  if(path[0]!=='current_price')assert.ok(valueText.includes('$65,000.00'));
 });
}
for(const value of [{...coin,market_data:null},{...coin,market_data:{}},{...coin,image:null,symbol:null},{...coin,name:{},symbol:{},image:{large:{}}}])test('crypto partial identity or missing nested market objects stays renderable',async()=>{
 const tree=await crypto(value);assert.ok(text(tree).includes('Healthy provider story'));const images=nodes(tree).filter(n=>n.type==='img');assert.ok(images.length);assert.ok(images.every(n=>typeof n.props.src==='string'));for(const image of images)if(image.props.src.startsWith('/'))assert.ok(existsSync(new URL('../public'+image.props.src,import.meta.url)));
});
for(const value of [null,{},[],{error:'private provider error'}])test('crypto total failure uses a friendly empty state',async()=>{
 const valueText=text(await crypto(value));assert.ok(valueText.includes('Could not load data'));assert.ok(!valueText.includes('private'));
});
for(const value of [null,{...coin,market_data:null},{...coin,symbol:42,image:null,market_data:{current_price:{usd:null}}}])test('crypto metadata handles missing price/identity without inventing a zero price',async()=>{
 const metadata=await module('app/crypto/[id]/page.tsx',async()=>value).generateMetadata({params:Promise.resolve({id:'bitcoin'})});
 assert.equal(typeof metadata.title,'string');assert.ok(!metadata.description.includes('$0'));assert.ok(metadata.description.includes('unavailable'));assert.equal(typeof metadata.openGraph.images[0].url,'string');
});
test('crypto true zero metrics remain zero and unavailable change has no directional marker',async()=>{
 const value=structuredClone(coin);value.market_data.current_price.usd=0;value.market_data.total_volume.usd=0;value.market_data.price_change_percentage_24h=null;
 const tree=await crypto(value);const valueText=text(tree);assert.ok(valueText.includes('$0.000000'));assert.ok(valueText.includes('0.00M BTC'));assert.ok(!valueText.includes('▲'));assert.ok(!valueText.includes('▼'));
});
for(const stories of [null,{articles:null},{articles:{}},{articles:[null,{}, {title:'Unsafe',url:'javascript:alert(1)'}]}])test('malformed news cannot crash either detail page',async()=>{
 assert.ok(text(await stock(quote,null,stories)).includes('$125.00'));assert.ok(text(await crypto(coin,stories)).includes('$65,000.00'));
});
