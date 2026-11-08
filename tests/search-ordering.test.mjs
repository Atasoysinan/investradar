import { loadDataRequest } from './support/data-request.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { decodeHtml } from './support/decode-html.mjs';

const source = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
function harness({ briefsResponse = () => Response.json({ status: 'ok', briefs: [] }), holdGlobalNews = false, fakeTimers = false, hidden = false } = {}) {
  const state = [], deps = [], cleanups = [], scheduled = [], requests = [];
  const timers = new Map(); let timerId = 0;
  const pageTimers = { setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; }, clearTimeout: id => timers.delete(id) };
  const timerOptions = fakeTimers ? pageTimers : {};
  const listeners = new Set();
  const document = { visibilityState: hidden ? 'hidden' : 'visible', addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
  const intervals = new Map();
  let now = 1_000_000;
  class ClockDate extends Date { static now() { return now; } }
  let cursor = 0, effectCursor = 0, tree, intervalId = 0;
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports, URL, Date: ClockDate, AbortController, document, ...pageTimers,
    window: { addEventListener() {}, removeEventListener() {} },
    setInterval: (fn, ms) => { intervals.set(++intervalId, { fn, ms }); return intervalId; },
    clearInterval: id => intervals.delete(id),
    fetch: (url, options) => {
      if (url === '/api/briefs') return Promise.resolve(briefsResponse());
      if (url === '/api/global-news' && holdGlobalNews) return new Promise(() => {});
      if (!url.startsWith('/api/news?')) return Promise.resolve(Response.json(url === '/api/sectors' ? [] : url === '/api/global-news' ? { americas: [], europe: [], asia: [] } : { briefs: [] }));
      return new Promise((resolve, reject) => requests.push({ url, signal: options.signal, resolve, reject }));
    },
    require: name => {
      if (name === '@/lib/dataRequest') return loadDataRequest((url, options) => {
        if (url === '/api/briefs') return Promise.resolve(briefsResponse());
        if (url === '/api/global-news' && holdGlobalNews) return new Promise(() => {});
        if (url.startsWith('/api/news?')) return new Promise((resolve, reject) => requests.push({ url, signal: options.signal, resolve, reject }));
        return Promise.resolve(Response.json(url === '/api/sectors' ? [] : { americas: [], europe: [], asia: [] }));
      }, timerOptions);
      if (name === '@/lib/decodeHtml') return { decodeHtml };
      if (name === 'react') return {
          useMemo: fn => fn(),
        useState: initial => {
          const i = cursor++; if (!(i in state)) state[i] = initial;
          return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }];
        },
        useRef: initial => ({ current: initial }),
        useEffect: (effect, values) => {
          const i = effectCursor++;
          if (!deps[i] || values.some((value, n) => value !== deps[i][n])) {
            scheduled.push(() => { cleanups[i]?.(); cleanups[i] = effect(); }); deps[i] = values;
          }
        },
      };
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      return { default: () => null };
    },
  });
  function render() { cursor = 0; effectCursor = 0; tree = exports.default(); scheduled.splice(0).forEach(run => run()); }
  function expire(ms) { for (const [id, t] of [...timers]) if (t.ms <= ms) { timers.delete(id); t.fn(); } }
  function nodes(node) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(nodes);
    return [node, ...nodes(node.props?.children)];
  }
  function text(node) {
    if (node == null || typeof node === 'boolean') return '';
    if (typeof node !== 'object') return String(node);
    return Array.isArray(node) ? node.map(text).join('') : text(node.props?.children);
  }
  render();
  return {
    timers, expire, intervals, listeners, advanceClock(ms) { now += ms; }, briefsError: () => state[4],
    visibility(value) { document.visibilityState = value; listeners.forEach(fn => fn()); render(); },
    requests, text: () => text(tree),
    briefLinks: () => {
      const panel = nodes(tree).find(n => n.type === 'aside' && text(n).includes("Today's Market Brief"));
      return nodes(panel).filter(n => n.type === 'li').map(item => ({
        headline: text(nodes(item).find(n => n.type === 'p')),
        url: nodes(item).find(n => n.type === 'a')?.props.href,
      }));
    },
    search(value, wait = true) { nodes(tree).find(n => n.type === 'input' && n.props.placeholder.startsWith('Search')).props.onChange({ target: { value } }); render(); if (wait) { expire(300); render(); } },
    submit() { nodes(tree).find(n => n.type === 'form' && n.props.onSubmit).props.onSubmit({ preventDefault() {} }); render(); expire(300); render(); },
    clear() { nodes(tree).find(n => n.type === 'button' && text(n) === 'Briefing').props.onClick(); render(); },
    poll() { [...intervals.values()].find(i => i.ms === 300000).fn(); render(); },
    async settle() { await new Promise(resolve => setImmediate(resolve)); render(); },
    cleanup() { cleanups.forEach(fn => fn?.()); },
    titles: () => Array.from(state[0], a => a.title), loading: () => state[1], error: () => state[2],
  };
}
const result = title => Response.json({ status: 'ok', articles: [{title,description:'',url:'https://example.test/story',publishedAt:'2026-10-24T00:00:00Z',source:{name:'Test'}}] });

test('fresh news survives tab switching without requests or extending its five-minute deadline', async () => {
  const h = harness();
  try {
    h.requests[0].resolve(result('Fresh news')); await h.settle();
    h.visibility('hidden'); h.advanceClock(10000); h.visibility('visible');
    assert.equal(h.requests.length, 1); assert.equal(h.loading(), false);
    assert.equal([...h.timers.values()][0].ms, 290000);
    h.visibility('hidden'); h.advanceClock(10000); h.visibility('visible');
    assert.equal(h.requests.length, 1); assert.equal([...h.timers.values()][0].ms, 280000);
    h.advanceClock(280000); h.expire(280000); assert.equal(h.requests.length, 2);
  } finally { h.cleanup(); }
});

test('expired news reloads on return, but changed and manually submitted queries bypass freshness', async () => {
  const h = harness();
  try {
    h.requests[0].resolve(result('Original')); await h.settle();
    h.visibility('hidden'); h.advanceClock(300000); h.visibility('visible'); assert.equal(h.requests.length, 2);
    h.requests[1].resolve(result('Fresh')); await h.settle();
    h.search('Apple'); assert.equal(h.requests.length, 3);
    h.requests[2].resolve(result('Apple')); await h.settle();
    h.submit(); assert.equal(h.requests.length, 4);
  } finally { h.cleanup(); }
});

test('failed news refresh is retried on return rather than marking old data fresh', async () => {
  const h = harness();
  try {
    h.requests[0].resolve(result('Original')); await h.settle(); h.poll();
    h.requests[1].resolve(new Response('', { status: 503 })); await h.settle();
    h.visibility('hidden'); h.visibility('visible');
    assert.equal(h.requests.length, 3); assert.deepEqual(h.titles(), ['Original']);
  } finally { h.cleanup(); }
});

test('rapid typing starts only the final search after 300ms and cancels the old response immediately', async () => {
  const h = harness();
  try {
    const old = h.requests[0];
    for (const value of ['N', 'Nv', 'Nvidia']) h.search(value, false);
    assert.equal(old.signal.aborted, true); assert.equal(h.requests.length, 1);
    old.resolve(result('Stale home story')); await h.settle(); assert.deepEqual(h.titles(), []);
    h.expire(299); assert.equal(h.requests.length, 1);
    h.expire(300); assert.equal(h.requests.length, 2);
    assert.equal(h.requests[1].url, '/api/news?q=Nvidia');
    h.requests[1].resolve(result('Nvidia result')); await h.settle();
    assert.deepEqual(h.titles(), ['Nvidia result']);
  } finally { h.cleanup(); }
});

test('clearing or unmounting cancels a pending search before it reaches the API', () => {
  const h = harness();
  h.search('Apple', false); h.clear(); h.expire(300);
  assert.equal(h.requests.length, 2); assert.equal(h.requests.at(-1).url, '/api/news?region=us');
  h.search('Nvidia', false); h.cleanup(); h.expire(300);
  assert.equal(h.requests.length, 2);
  assert.equal(h.intervals.size, 0); assert.equal(h.listeners.size, 0);
});

test('hidden homepage cancels polling and in-flight news, then resumes one polling loop', async () => {
  const h = harness();
  try {
    const queuedPoll = [...h.intervals.values()][0].fn;
    const old = h.requests[0]; h.visibility('hidden');
    assert.equal(old.signal.aborted, true); assert.equal(h.intervals.size, 0);
    queuedPoll(); assert.equal(h.requests.length, 1);
    old.resolve(result('Hidden stale result')); await h.settle();
    assert.deepEqual(h.titles(), []); assert.equal(h.error(), '');
    h.visibility('visible'); assert.equal(h.requests.length, 2); assert.equal(h.intervals.size, 1);
    h.requests[1].resolve(result('Resumed result')); await h.settle();
    assert.deepEqual(h.titles(), ['Resumed result']);
    for (let i = 0; i < 3; i++) { h.visibility('hidden'); h.visibility('visible'); }
    assert.equal(h.intervals.size, 0); assert.equal(h.timers.size, 1);
    const queuedAfterUnmount = [...h.timers.values()][0].fn, count = h.requests.length, wasLoading = h.loading();
    h.cleanup(); queuedAfterUnmount();
    assert.equal(h.requests.length, count); assert.equal(h.loading(), wasLoading);
  } finally { h.cleanup(); }
});

test('a page opened hidden defers news and keeps only the latest typed query on resume', () => {
  const h = harness({ hidden: true });
  try {
    assert.equal(h.requests.length, 0); assert.equal(h.intervals.size, 0);
    h.search('Apple', false); h.expire(300); assert.equal(h.requests.length, 0);
    h.search('Nvidia', false); h.visibility('visible'); h.expire(300);
    assert.equal(h.requests.length, 1); assert.equal(h.requests[0].url, '/api/news?q=Nvidia');
  } finally { h.cleanup(); }
});

test('a late result for an older query cannot overwrite a newer result', async () => {
  const h = harness(); h.search('Apple'); const old = h.requests.at(-1);
  h.search('Nvidia'); const current = h.requests.at(-1);
  assert.equal(old.signal.aborted, true);
  current.resolve(result('Nvidia latest results')); await h.settle();
  old.resolve(result('Apple stale results')); await h.settle();
  assert.deepEqual(h.titles(), ['Nvidia latest results']); assert.equal(h.error(), ''); assert.equal(h.loading(), false);
});

test('a stale failure cannot end the loading state of the current query', async () => {
  const h = harness(); const old = h.requests[0]; h.search('Nvidia');
  old.reject(new Error('stale network failure')); await h.settle();
  assert.equal(h.loading(), true); assert.equal(h.error(), '');
  h.requests.at(-1).resolve(result('Current result')); await h.settle(); assert.equal(h.loading(), false);
});

test('a late success cannot hide a current query error', async () => {
  const h = harness(); const old = h.requests[0]; h.search('Nvidia');
  h.requests.at(-1).resolve(new Response('', {status:500})); await h.settle();
  old.resolve(result('Old home result')); await h.settle();
  assert.equal(h.error(), 'News is temporarily unavailable. Please try again.'); assert.deepEqual(h.titles(), []);
});

test('submitting the same query twice still gives priority to the latest request', async () => {
  const h = harness(); h.search('Nvidia'); const old = h.requests.at(-1); h.submit();
  h.requests.at(-1).resolve(result('Latest submitted result')); await h.settle();
  old.resolve(result('Older typed result')); await h.settle();
  assert.deepEqual(h.titles(), ['Latest submitted result']);
});

test('clearing the query cannot be overwritten by the previous search', async () => {
  const h = harness(); h.search('Nvidia'); const old = h.requests.at(-1); h.clear();
  h.requests.at(-1).resolve(result('Latest home result')); await h.settle();
  old.resolve(result('Old search result')); await h.settle();
  assert.deepEqual(h.titles(), ['Latest home result']);
});

test('overlapping automatic refreshes prioritize the most recent request', async () => {
  const h = harness(); const old = h.requests[0]; h.poll();
  assert.equal(old.signal.aborted, true);
  h.requests.at(-1).resolve(result('Latest periodic result')); await h.settle();
  old.resolve(result('Stale periodic result')); await h.settle();
  assert.deepEqual(h.titles(), ['Latest periodic result']);
});

test('leaving the page aborts the request and ignores its late response', async () => {
  const h = harness(); const old = h.requests[0]; h.cleanup();
  assert.equal(old.signal.aborted, true);
  old.resolve(result('Unmounted result')); await h.settle();
  assert.deepEqual(h.titles(), []);
});

for (const [status, message] of [[429, 'AI summaries are busy. Please try again shortly.'], [504, 'AI summaries timed out. Please try again.'], [503, 'AI summaries are temporarily unavailable. Please try again.']]) {
  test(`AI ${status} is visible independently of a slow global-news panel`, async () => {
    const h = harness({ holdGlobalNews: true, briefsResponse: () => Response.json({ status: 'unavailable', briefs: [], message: 'private provider error' }, { status }) });
    await h.settle(); assert.ok(h.text().includes(message)); assert.ok(!h.text().includes('private provider error')); h.cleanup();
  });
}

test('successful AI summaries render independently of pending news', async () => {
  const h = harness({ holdGlobalNews: true, briefsResponse: () => Response.json({ status: 'ok', briefs: [{ headline: 'Independent AI headline', summary: 'Independent summary.', sources: [{name: 'Test', url: 'https://example.test/story'}] }] }) });
  await h.settle(); assert.ok(h.text().includes('Independent AI headline')); h.cleanup();
});

test('a single AI selection matching the hero remains in the market brief panel', async () => {
  const headline = 'DoorDash bid could be announced Thursday, sources say';
  const h = harness({ briefsResponse: () => Response.json({ status: 'ok', briefs: [{ headline, summary: headline, sources: [{ name: 'Fixture', url: 'https://example.test/selected' }] }] }) });
  try {
    h.requests[0].resolve(result(headline)); await h.settle();
    assert.deepEqual(h.briefLinks(), [{ headline, url: 'https://example.test/selected' }]);
  } finally { h.cleanup(); }
});

test('the market brief omits an entity-encoded hero duplicate when another AI selection exists', async () => {
  const h = harness({ briefsResponse: () => Response.json({ status: 'ok', briefs: [
    { headline: 'Markets &amp; shares', summary: '', sources: [{ name: 'Fixture', url: 'https://example.test/hero' }] },
    { headline: 'Independent story', summary: '', sources: [{ name: 'Fixture', url: 'https://example.test/other' }] },
  ] }) });
  try {
    h.requests[0].resolve(result('Markets & shares')); await h.settle();
    assert.deepEqual(h.briefLinks(), [{ headline: 'Independent story', url: 'https://example.test/other' }]);
  } finally { h.cleanup(); }
});

test('empty AI selections still fall back to available news headlines', async () => {
  const h = harness();
  try {
    h.requests[0].resolve(Response.json({ status: 'ok', articles: Array.from({ length: 5 }, (_, i) => ({
      title: `News ${i}`, description: '', url: `https://example.test/news-${i}`, publishedAt: '', source: { name: 'Fixture' },
    })) })); await h.settle();
    assert.deepEqual(h.briefLinks(), [3, 4].map(i => ({ headline: `News ${i}`, url: `https://example.test/news-${i}` })));
  } finally { h.cleanup(); }
});

for (const phase of ['headers', 'body']) test(`homepage news timeout bounds stalled ${phase} and ignores late data`, async () => {
  const h = harness({ fakeTimers: true }); const request = h.requests[0];
  let finishBody;
  if (phase === 'body') { request.resolve({ ok: true, json: () => new Promise(resolve => { finishBody = resolve; }) }); await h.settle(); }
  h.expire(12000); await h.settle();
  assert.equal(h.loading(), false); assert.match(h.error(), /too long/); assert.equal(request.signal.aborted, true);
  if (finishBody) finishBody({ status: 'ok', articles: [{ title: 'Late data' }] });
  else request.resolve(result('Late data'));
  await h.settle(); assert.deepEqual(h.titles(), []);
  h.poll(); h.requests.at(-1).resolve(result('Recovered news')); await h.settle();
  assert.deepEqual(h.titles(), ['Recovered news']); assert.equal(h.error(), ''); h.cleanup(); assert.equal(h.timers.size, 0);
});
for (const phase of ['headers', 'body']) test(`homepage AI timeout bounds stalled ${phase} independently of news`, async () => {
  let finish; const pending = new Promise(resolve => { finish = resolve; });
  const h = harness({ fakeTimers: true, briefsResponse: () => phase === 'headers' ? pending : { ok: true, json: () => pending } });
  h.requests[0].resolve(result('Healthy news')); await h.settle(); h.expire(15000); await h.settle();
  assert.deepEqual(h.titles(), ['Healthy news']); assert.match(h.briefsError(), /timed out/);
  finish(phase === 'headers' ? Response.json({ status: 'ok', briefs: [] }) : { status: 'ok', briefs: [] });
  await h.settle(); assert.match(h.briefsError(), /timed out/); h.cleanup(); assert.equal(h.timers.size, 0);
});
test('homepage unmount cancels both pending requests and clears deadlines', async () => {
  const h = harness({ fakeTimers: true, briefsResponse: () => new Promise(() => {}) });
  assert.equal(h.timers.size, 2); h.cleanup(); await h.settle(); assert.equal(h.timers.size, 0); assert.equal(h.requests[0].signal.aborted, true); assert.equal(h.error(), ''); assert.equal(h.briefsError(), '');
});

const partialResult = (title, articles = true) => Response.json({ status: 'ok', articles: articles ? [{ title, description: '', url: 'https://example.test/story', publishedAt: '2026-10-28T00:00:00Z', source: { name: 'Fixture' } }] : [] }, { headers: { 'X-News-Data-Partial': 'true' } });
const partialMessage = 'Some news sources are temporarily unavailable. Showing available news.';
test('homepage partial news remains visible with an accessible notice, cleared by full success', async () => {
  const h = harness(); h.requests[0].resolve(partialResult('Available news')); await h.settle();
  assert.deepEqual(h.titles(), ['Available news']); assert.ok(h.text().includes(partialMessage)); assert.equal(h.error(), '');
  h.poll(); h.requests.at(-1).resolve(result('Complete news')); await h.settle();
  assert.deepEqual(h.titles(), ['Complete news']); assert.ok(!h.text().includes(partialMessage)); h.cleanup();
});
test('homepage total failure shows error instead of a partial notice and keeps old articles', async () => {
  const h = harness(); h.requests[0].resolve(partialResult('Existing news')); await h.settle(); h.poll();
  h.requests.at(-1).resolve(Response.json({ status: 'error', articles: [] }, { status: 503 })); await h.settle();
  assert.deepEqual(h.titles(), ['Existing news']); assert.ok(h.error()); assert.ok(!h.text().includes(partialMessage)); h.cleanup();
});
test('homepage late old-query partial response cannot change new-query completeness', async () => {
  const h = harness(); const old = h.requests[0]; h.search('Nvidia'); h.requests.at(-1).resolve(result('New results')); await h.settle();
  old.resolve(partialResult('Old results')); await h.settle(); assert.deepEqual(h.titles(), ['New results']); assert.ok(!h.text().includes(partialMessage)); h.cleanup();
});
test('homepage partial empty result still explains unavailable sources', async () => {
  const h = harness(); h.requests[0].resolve(partialResult('', false)); await h.settle(); assert.deepEqual(h.titles(), []); assert.ok(h.text().includes(partialMessage)); assert.equal(h.error(), ''); h.cleanup();
});
for (const date of ['', 'invalid', undefined]) test(`homepage undated story ${String(date)} shows date unavailable instead of invented recency`, async () => {
  const h = harness(); h.requests[0].resolve(Response.json({ status:'ok',articles:[{ title:'Undated market story',description:'Financial news',url:'https://example.test/story',publishedAt:date,source:{name:'Fixture'},isLive:false }] })); await h.settle();
  assert.ok(h.text().includes('Date unavailable')); assert.ok(!h.text().includes('NaN')); assert.ok(!h.text().includes('0m ago')); assert.ok(!h.text().includes('LIVE')); h.cleanup();
});
