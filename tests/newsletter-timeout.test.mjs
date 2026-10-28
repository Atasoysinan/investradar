import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function harness() {
  const state=[],refs=[],effects=[],timers=new Map(),requests=[];let index=0,refIndex=0,id=0,tree;
  const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../components/NewsletterSignup.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
    exports,AbortController,setTimeout(fn,ms){timers.set(++id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},
    fetch(url,options){return new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}));},
    require(name){if(name==='react')return{useState(initial){const i=index++;if(!(i in state))state[i]=initial;return[state[i],value=>state[i]=value];},useRef(initial){const i=refIndex++;return refs[i]??=( {current:initial} );},useEffect(fn){if(!effects.length)effects.push(fn());}};if(name==='react/jsx-runtime')return{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};throw Error(name);},
  });
  function render(){index=0;refIndex=0;tree=exports.default();}
  function nodes(node){if(!node||typeof node!=='object')return[];return Array.isArray(node)?node.flatMap(nodes):[node,...nodes(node.props?.children)];}
  render();nodes(tree).find(n=>n.type==='input').props.onChange({target:{value:'test@example.com'}});render();
  return{state,requests,timers,submit(){const p=nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});render();return p;},expire(){for(const t of [...timers.values()]){assert.equal(t.ms,20000);t.fn();}},async settle(){await new Promise(r=>setImmediate(r));render();},cleanup(){effects.forEach(fn=>fn?.());},disabled(){return nodes(tree).find(n=>n.type==='button')?.props.disabled;}};
}
for(const phase of ['headers','body'])test(`newsletter stalled ${phase} times out and late success cannot overwrite retry`,async()=>{
 const h=harness();const pending=h.submit();let resolveBody;const old=h.requests[0];
 if(phase==='body'){old.resolve({ok:true,json:()=>new Promise(r=>resolveBody=r)});await h.settle();}
 h.expire();await pending;await h.settle();assert.equal(h.state[1],'error');assert.match(h.state[2],/Check your inbox/);assert.equal(h.disabled(),false);assert.equal(old.options.signal.aborted,true);assert.equal(h.state[0],'test@example.com');assert.equal(h.timers.size,0);
 const retry=h.submit();h.requests[1].resolve(Response.json({success:true}));await retry;await h.settle();assert.equal(h.state[1],'success');
 if(resolveBody)resolveBody({success:true});else old.resolve(Response.json({success:true}));await h.settle();assert.equal(h.state[1],'success');assert.equal(h.state[0],'');assert.equal(h.requests.length,2);assert.equal(h.timers.size,0);
});
test('unmount aborts pending work and clears timer without setting error',async()=>{const h=harness();const pending=h.submit();h.cleanup();await pending;assert.equal(h.requests[0].options.signal.aborted,true);assert.equal(h.timers.size,0);assert.equal(h.state[2],'');});
test('repeated submit while pending cannot start another send',async()=>{const h=harness();const p=h.submit();await h.submit();assert.equal(h.requests.length,1);h.requests[0].resolve(Response.json({success:true}));await p;assert.equal(h.timers.size,0);});
for(const status of [409,429,502,504])test(`newsletter preserves server error ${status}`,async()=>{const h=harness();const p=h.submit();h.requests[0].resolve(Response.json({error:'Please wait before trying this email again.'},{status}));await p;assert.equal(h.state[1],'error');assert.equal(h.state[2],'Please wait before trying this email again.');assert.equal(h.timers.size,0);});
for(const value of [null,{}, {success:false}])test('invalid successful response cannot show subscription success',async()=>{const h=harness();const p=h.submit();h.requests[0].resolve(Response.json(value));await p;assert.equal(h.state[1],'error');assert.equal(h.timers.size,0);});
test('network rejection releases button and timer',async()=>{const h=harness();const p=h.submit();h.requests[0].reject(Error('private'));await p;await h.settle();assert.equal(h.disabled(),false);assert.equal(h.state[1],'error');assert.equal(h.timers.size,0);assert.ok(!h.state[2].includes('private'));});
