import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { loadDataRequest } from './support/data-request.mjs';
function harness(fetcher) {
  const state=[],effects=[],timers=new Map(),requests=[];let cursor=0,mounted=false,tree,updates=0,cleanup,id=0;
  const jsx=(type,props)=>typeof type==='function'?type(props):({type,props});
  const exports={};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../components/MarketPulseDashboard.tsx',import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
  }).outputText,{exports,AbortController,require(name){
    if(name==='@/lib/dataRequest')return loadDataRequest((url,options)=>{requests.push({url,signal:options.signal});return fetcher(url,options);},{
      setTimeout(fn,ms){timers.set(++id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},
    });
    if(name==='react')return{useState(initial){const index=cursor++;if(!(index in state))state[index]=initial;return[state[index],value=>{updates++;state[index]=value;}];},useEffect(fn){if(!mounted)effects.push(fn);}};
    if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};return{default:'a'};
  }});
  function render(){cursor=0;tree=exports.default();if(!mounted){mounted=true;effects.forEach(fn=>{cleanup=fn();});}}
  function text(node){if(node==null||typeof node==='boolean')return'';if(Array.isArray(node))return node.map(text).join('');return typeof node==='object'?text(node.props?.children):String(node);}
  render();return{requests,timers,text:()=>text(tree),updates:()=>updates,async settle(){await new Promise(resolve=>setImmediate(resolve));render();},expire(){[...timers.values()].forEach(({fn})=>fn());},close(){cleanup();}};
}
const quotes=[{symbol:'SPY',c:125,dp:null},{symbol:'NVDA',c:150,dp:0}];
const sectors=[{ticker:'XLK',sectorName:'Technology',price:100,changePercent:2}];
test('new dashboard preserves nullable changes and skips malformed rows without losing good data',async()=>{
 const h=harness(async url=>Response.json(url.includes('/market?')?[null,{},...quotes,{symbol:'MSFT',c:'100',dp:3}]:[null,{},...sectors]));
 await h.settle();const text=h.text();assert.ok(text.includes('125'));assert.ok(text.includes('150.00'));assert.ok(text.includes('0.00%'));assert.ok(text.includes('Technology'));assert.ok(text.includes('Some market data is unavailable.'));
 assert.ok(!text.includes('NaN'));assert.ok(!text.includes('+0.00%'));assert.equal(h.timers.size,0);
});
for(const failed of ['market','sectors'])test(`${failed} rejection preserves the other healthy dashboard source`,async()=>{
 const h=harness(async url=>url.includes(failed)?Response.json({error:'private detail'},{status:429}):Response.json(url.includes('/market?')?quotes:sectors));
 await h.settle();assert.ok(h.text().includes(failed==='market'?'Technology':'125'));assert.ok(h.text().includes('Some market data is unavailable.'));assert.ok(!h.text().includes('private'));assert.equal(h.timers.size,0);
});
for(const stage of ['headers','body'])test(`${stage}: dashboard timeout ends loading and ignores late results`,async()=>{
 let release;const held=new Promise(resolve=>{release=resolve;});
 const h=harness(async()=>stage==='headers'?held:{ok:true,json:()=>held});await h.settle();assert.ok(h.text().includes('Loading verified market data'));
 assert.ok([...h.timers.values()].every(timer=>timer.ms===12000));h.expire();await h.settle();assert.ok(h.text().includes('Market data is temporarily unavailable.'));assert.ok(h.requests.every(r=>r.signal.aborted));const updates=h.updates();
 release(stage==='headers'?Response.json(quotes):quotes);await h.settle();assert.equal(h.updates(),updates);assert.equal(h.timers.size,0);
});
test('closing the dashboard cancels work and prevents late state updates',async()=>{
 const h=harness(async()=>new Promise(()=>{}));const updates=h.updates();h.close();await h.settle();assert.equal(h.updates(),updates);assert.ok(h.requests.every(r=>r.signal.aborted));assert.equal(h.timers.size,0);
});
