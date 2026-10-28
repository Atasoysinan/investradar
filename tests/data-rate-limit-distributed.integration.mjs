import { Redis } from '@upstash/redis';
import { createHash, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/dataRateLimit.ts', import.meta.url), 'utf8'), {
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText,{exports,process,AbortSignal,setTimeout,clearTimeout,require:name=>name==='@upstash/redis'?{Redis}:name==='node:crypto'?{createHash}:name==='node:net'?{isIP}:{NextResponse:Response}});
const client=()=>new Redis({url:process.env.KV_REST_API_URL,token:process.env.KV_REST_API_TOKEN,retry:{retries:0},enableAutoPipelining:false,signal:()=>AbortSignal.timeout(3000)});
async function fixture(run){
 const redis=client(),prefix=`investradar:test:data-limits:${randomUUID()}`;
 try{await run({redis,prefix,a:exports.createDataRateLimit(redis,prefix),b:exports.createDataRateLimit(client(),prefix)});}
 finally{const keys=await redis.keys(`${prefix}:*`);if(keys.length)await redis.del(...keys);}
}
test('weighted market client quota is atomic across independent instances',()=>fixture(async({a,b,redis,prefix})=>{
 const results=await Promise.all(Array.from({length:15},(_,i)=>(i%2?a:b)('market','client',30)));
 assert.equal(results.filter(n=>n===0).length,8);assert.ok(results.filter(n=>n>0).every(n=>n<=60000));
 assert.equal(await redis.get(`${prefix}:market:client:client`),240);assert.equal(await redis.get(`${prefix}:market:global`),240);
}));
test('global market budget stops new clients without consuming their budget',()=>fixture(async({a,b,redis,prefix})=>{
 await redis.set(`${prefix}:market:global`,1170,{px:60000});
 const results=await Promise.all(Array.from({length:8},(_,i)=>(i%2?a:b)('market',`client-${i}`,30)));
 assert.equal(results.filter(n=>n===0).length,1);assert.equal(await redis.get(`${prefix}:market:global`),1200);
 const blocked=results.findIndex(n=>n>0);assert.equal(await redis.get(`${prefix}:market:client:client-${blocked}`),null);
}));
test('news windows reset, and market and environment prefixes remain isolated',()=>fixture(async({a,redis,prefix})=>{
 await redis.set(`${prefix}:news:client:client`,30,{px:60000});await redis.set(`${prefix}:news:global`,30,{px:60000});
 assert.ok(await a('news','client')>0);assert.equal(await a('market','client',30),0);
 const other=exports.createDataRateLimit(redis,prefix+':preview');assert.equal(await other('news','client'),0);
 await redis.pexpire(`${prefix}:news:client:client`,1);await new Promise(resolve=>setTimeout(resolve,30));
 assert.equal(await a('news','client'),0);assert.equal(await redis.get(`${prefix}:news:client:client`),1);
}));
test('global news budget is shared across alternate clients and rejects atomically',()=>fixture(async({a,b,redis,prefix})=>{
 await redis.set(`${prefix}:news:global`,299,{px:60000});
 const results=await Promise.all(Array.from({length:8},(_,i)=>(i%2?a:b)('news',`client-${i}`)));
 assert.equal(results.filter(n=>n===0).length,1);assert.equal(await redis.get(`${prefix}:news:global`),300);
}));
