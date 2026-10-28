import { ETF_INFO } from '../../lib/etfCatalog.ts';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
export function etfRoute({ blocked = false, failure = false } = {}) {
  const calls = [], admissions = [], exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../app/api/etfs/route.ts', import.meta.url),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {
    exports, process:{env:{FINNHUB_KEY:'fixture'}}, require(name) {
      if(name==='@/lib/etfCatalog')return {ETF_INFO};
      if(name==='next/server')return {NextResponse:Response};
      if(name==='@/lib/dataRateLimit')return {checkDataRateLimit:async(_request,group,cost)=>{admissions.push({group,cost});return blocked?new Response(null,{status:429}):null;}};
      if(name==='@/lib/marketQuotes')return {fetchMarketQuote:async symbol=>{calls.push(symbol);if(failure&&symbol==='EWJ')throw Error('fixture failure');return {c:125,d:0,dp:0};},marketQuoteList:results=>Response.json(results.flatMap(r=>r.status==='fulfilled'?[r.value]:[]),{headers:results.some(r=>r.status==='rejected')?{'X-Market-Data-Partial':'true'}:{}})};
      throw Error(name);
    },
  });return {calls,admissions,run:()=>exports.GET(new Request('http://localhost/api/etfs'))};
}
