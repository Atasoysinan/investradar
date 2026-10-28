import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { Redis } from '@upstash/redis';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
function harness(transport) {
  const modules=new Map(),requests=[],providers=[];
  function load(file){
    if(modules.has(file))return modules.get(file);
    const exports={};modules.set(file,exports);
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{
      compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
    }).outputText,{
      exports,URL,Date,Request,AbortController,AbortSignal,setTimeout,clearTimeout,
      process:{env:{VERCEL_ENV:'production',VERCEL:'1',KV_REST_API_URL:'https://redis.test',KV_REST_API_TOKEN:'test',GROQ_API_KEY:'test',RESEND_API_KEY:'test'}},
      fetch:async url=>{providers.push(url);throw new Error('Unexpected provider access');},
      require(name){
        if(name==='@upstash/redis')return{Redis};
        if(name==='next/server')return{NextResponse:Response};
        if(name==='node:crypto')return{createHash};if(name==='node:net')return{isIP};
        if(name==='resend')return{Resend:class{constructor(){providers.push('Resend');throw new Error('Unexpected Resend access');}}};
        if(name.startsWith('@/lib/'))return load(name.replace('@/','')+'.ts');throw new Error('Unexpected module '+name);
      },
    });return exports;
  }
  const original=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{const command=JSON.parse(options.body);requests.push(command);return transport(command,requests.length);};
  return{load,requests,providers,close(){globalThis.fetch=original;}};
}
for(const [name,file,operation]of[
  ['AI','lib/briefsRateLimit.ts',m=>m.getBriefsRateLimit().limit('client')],
  ['subscription client','lib/subscriptionRateLimit.ts',m=>m.getSubscriptionRateLimit().client('client')],
  ['subscription attempt','lib/subscriptionRateLimit.ts',m=>m.getSubscriptionRateLimit().attempt('email-hash')],
]){
 test(`${name}: ambiguous failed write makes exactly one installed-SDK request`,async()=>{
  let applied=0;const h=harness(async()=>{applied++;throw new Error('private network failure after write');});
  try{await assert.rejects(operation(h.load(file)));assert.equal(h.requests.length,1);assert.equal(applied,1);assert.equal(h.requests[0][0],'eval');}finally{h.close();}
 });
 test(`${name}: explicit later retry is possible without an automatic replay`,async()=>{
  let fail=true;const h=harness(async()=>{if(fail)throw new Error('controlled failure');return Response.json({result:name==='subscription attempt'?[0,0]:0});});
  try{
   const limiterModule=h.load(file);await assert.rejects(operation(limiterModule));assert.equal(h.requests.length,1);
   fail=false;const result=await operation(limiterModule);assert.equal(h.requests.length,2);assert.equal(typeof result==='object'?result.reason:result,0);
  }finally{h.close();}
 });
}
test('AI Redis failure returns safe 503 before news or AI provider work',async()=>{
 const h=harness(async()=>{throw new Error('private Redis connection detail');});
 try{const response=await h.load('app/api/briefs/route.ts').GET(new Request('https://example.test/api/briefs'));
  assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(h.requests.length,1);assert.deepEqual(h.providers,[]);
  assert.ok(!JSON.stringify(await response.json()).includes('private'));
 }finally{h.close();}
});
for(const stage of ['client','attempt'])test(`subscription ${stage} failure returns safe 503 before contact or welcome work`,async()=>{
 const h=harness(async(command)=>{
  if(stage==='attempt'&&!command[1].includes('local cooldown'))return Response.json({result:0});
  throw new Error('private Redis connection detail');
 });
 try{const response=await h.load('app/api/subscribe/route.ts').POST(new Request('https://example.test/api/subscribe',{
  method:'POST',headers:{'Content-Type':'application/json','x-vercel-forwarded-for':'203.0.113.1'},body:JSON.stringify({email:'test@example.test'}),
 }));
 assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(h.requests.length,stage==='client'?1:2);assert.deepEqual(h.providers,[]);
 assert.ok(!JSON.stringify(await response.json()).includes('private'));
 }finally{h.close();}
});
