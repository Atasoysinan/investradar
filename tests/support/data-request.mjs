import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
export function loadDataRequest(fetcher, overrides = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../lib/dataRequest.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, fetch: fetcher, Date, AbortController, setTimeout, clearTimeout, ...overrides });
  return exports;
}
