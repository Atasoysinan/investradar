import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function harness(hidden = false) {
  const requests = [], intervals = new Map(), timers = new Map(), listeners = new Set(), cleanups = [], states = [];
  let now = 1_000_000;
  class ClockDate extends Date { static now() { return now; } }
  let timer = 0, cursor = 0;
  const document = { visibilityState: hidden ? 'hidden' : 'visible', addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../components/TickerBar.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports, document, AbortController, Date: ClockDate,
    setTimeout: (fn, ms) => { timers.set(++timer, { fn, ms }); return timer; }, clearTimeout: id => timers.delete(id),
    setInterval: fn => { intervals.set(++timer, fn); return timer; }, clearInterval: id => intervals.delete(id),
    require: name => name === '@/lib/dataRequest' ? { fetchJson: (url, options) => new Promise((resolve, reject) => requests.push({ url, signal: options.signal, resolve, reject })) }
      : name === 'react' ? { useEffect: fn => cleanups.push(fn()), useState: initial => { const i = cursor++; states[i] = initial; return [initial, value => { states[i] = value; }]; } }
        : name === 'react/jsx-runtime' ? { jsx: () => null, jsxs: () => null } : { default: () => null },
  });
  exports.default();
  return { requests, intervals, timers, listeners, states,
    advanceClock(ms) { now += ms; },
    expire(ms) { for (const [id, t] of [...timers]) if (t.ms <= ms) { timers.delete(id); t.fn(); } },
    visibility(value) { document.visibilityState = value; listeners.forEach(fn => fn()); },
    cleanup() { cleanups.forEach(fn => fn()); },
  };
}

test('ticker stops hidden polling, ignores aborted results and resumes exactly one loop', async () => {
  const h = harness();
  try {
    assert.equal(h.requests.length, 1);
    const queued = [...h.intervals.values()][0], old = h.requests[0];
    h.visibility('hidden'); assert.equal(old.signal.aborted, true); assert.equal(h.intervals.size, 0);
    queued(); assert.equal(h.requests.length, 1);
    old.resolve([{ symbol: 'STALE', c: 1 }]); await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.states[0].length, 0);
    h.visibility('visible'); assert.equal(h.requests.length, 2); assert.equal(h.intervals.size, 1);
    h.requests[1].resolve([{ symbol: 'AAPL', c: 200 }]); await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.states[0][0].symbol, 'AAPL');
    for (let i = 0; i < 3; i++) { h.visibility('hidden'); h.visibility('visible'); }
    assert.equal(h.intervals.size, 0); assert.equal(h.timers.size, 1);
    const queuedAfterUnmount = [...h.timers.values()][0].fn, count = h.requests.length;
    h.cleanup(); queuedAfterUnmount(); assert.equal(h.requests.length, count);
  } finally { h.cleanup(); }
  assert.equal(h.intervals.size, 0); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
  assert.equal(h.requests.at(-1).signal.aborted, true);
});

test('ticker mounted in a hidden tab waits for visibility before requesting quotes', () => {
  const h = harness(true);
  try {
    assert.equal(h.requests.length, 0); assert.equal(h.intervals.size, 0);
    h.visibility('visible'); assert.equal(h.requests.length, 1); assert.equal(h.intervals.size, 1);
  } finally { h.cleanup(); }
});

test('fresh ticker preserves its one-minute deadline across repeated visibility changes', async () => {
  const h = harness();
  try {
    h.requests[0].resolve([{ symbol: 'AAPL', c: 200 }]); await new Promise(resolve => setImmediate(resolve));
    h.visibility('hidden'); h.advanceClock(10000); h.visibility('visible');
    assert.equal(h.requests.length, 1); assert.equal([...h.timers.values()][0].ms, 50000);
    h.visibility('hidden'); h.advanceClock(10000); h.visibility('visible');
    assert.equal(h.requests.length, 1); assert.equal([...h.timers.values()][0].ms, 40000);
    h.advanceClock(40000); h.expire(40000); assert.equal(h.requests.length, 2);
  } finally { h.cleanup(); }
});

test('expired ticker refreshes immediately on return', async () => {
  const h = harness();
  try {
    h.requests[0].resolve([{ symbol: 'AAPL', c: 200 }]); await new Promise(resolve => setImmediate(resolve));
    h.visibility('hidden'); h.advanceClock(60000); h.visibility('visible');
    assert.equal(h.requests.length, 2); assert.equal(h.intervals.size, 1);
  } finally { h.cleanup(); }
});

for (const response of ['error', 'empty', 'invalid']) test(`ticker ${response} response does not mark old quotes fresh`, async () => {
  const h = harness();
  try {
    h.requests[0].resolve([{ symbol: 'AAPL', c: 200 }]); await new Promise(resolve => setImmediate(resolve));
    [...h.intervals.values()][0]();
    if (response === 'error') h.requests[1].reject(new Error('network'));
    else h.requests[1].resolve(response === 'empty' ? [] : [{ symbol: 'AAPL', c: 0 }]);
    await new Promise(resolve => setImmediate(resolve));
    h.visibility('hidden'); h.visibility('visible'); assert.equal(h.requests.length, 3);
    assert.equal(h.states[0][0].c, 200);
  } finally { h.cleanup(); }
});
