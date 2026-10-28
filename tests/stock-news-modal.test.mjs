import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('../components/StockNewsModal.tsx', import.meta.url), 'utf8');
const news = [{ id: 1, headline: 'Actual provider headline', summary: '', url: 'https://example.test/story', source: 'Source', datetime: 1792843200, image: '' }];
const quote = { quote: { c: 125, d: 0, dp: 0, h: 130, l: 120, o: 125, pc: 125 } };
function harness(fetcher = async url => Response.json(url.includes('type=news') ? news : quote)) {
  let state = [], deps = [], cleanups = [], cursor = 0, effectCursor = 0, key, symbol = 'AAPL', tree, respond = fetcher, updates = 0;
  const exports = {}, scheduled = [], timers = new Map(), requests = []; let timerId = 0;
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, URL, Date, AbortController,
    fetch(url, options) { requests.push({ url, signal: options.signal }); return respond(url, options); },
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout(id) { timers.delete(id); },
    require(name) {
      if (name === 'react') return {
        useState(initial) { const index = cursor++; if (!(index in state)) state[index] = initial;
          return [state[index], value => { updates++; state[index] = typeof value === 'function' ? value(state[index]) : value; }]; },
        useEffect(effect, values) { const index = effectCursor++;
          if (!deps[index] || values.some((value, n) => value !== deps[index][n])) {
            scheduled.push(() => { cleanups[index]?.(); cleanups[index] = effect(); }); deps[index] = values;
          }
        },
      };
      if (name === 'react/jsx-runtime') return { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) };
      return { default: () => null };
    },
  });
  function render() {
    const child = exports.default({ symbol, onClose() {} });
    if (key !== child.key) { cleanups.forEach(fn => fn?.()); state = []; deps = []; cleanups = []; key = child.key; }
    cursor = 0; effectCursor = 0; tree = child.type(child.props); scheduled.splice(0).forEach(run => run());
  }
  function nodes(node) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(nodes); return [node, ...nodes(node.props?.children)]; }
  function text(node) { if (node == null || typeof node === 'boolean') return ''; if (Array.isArray(node)) return node.map(text).join(''); return typeof node === 'object' ? text(node.props?.children) : String(node); }
  render();
  return { requests, timers, text: () => text(tree), updates: () => updates,
    loading: () => nodes(tree).some(node => node.props?.['aria-label'] === 'Loading stock news'),
    async settle() { await new Promise(resolve => setImmediate(resolve)); render(); },
    respond(fn) { respond = fn; },
    retry() { const button = nodes(tree).find(node => node.type === 'button' && text(node) === 'Try again'); assert.ok(button); assert.ok(!button.props.disabled); button.props.onClick(); render(); },
    timeout() { [...timers.values()].forEach(({ fn }) => fn()); },
    switch(value) { symbol = value; render(); },
    close() { cleanups.forEach(fn => fn?.()); },
  };
}

for (const [name, response] of [
  ['network failure', async () => { throw new Error('private network detail'); }],
  ['HTTP failure', async () => Response.json(news, { status: 502 })],
  ['invalid JSON', async () => new Response('{broken')],
  ['wrong payload', async () => Response.json({ error: 'private provider detail' })],
  ['malformed row', async () => Response.json([{ ...news[0], headline: {}, datetime: null }])],
]) {
  test(`${name} ends news loading and offers a safe retry while retaining a valid price`, async () => {
    const h = harness(async url => url.includes('type=news') ? response() : Response.json(quote));
    await h.settle(); assert.equal(h.loading(), false);
    assert.ok(h.text().includes('Stock news is temporarily unavailable. Please try again.'));
    assert.ok(h.text().includes('125.00')); assert.ok(!h.text().includes('No recent news found.')); assert.ok(!h.text().includes('private'));
    h.respond(async url => Response.json(url.includes('type=news') ? news : quote));
    h.retry(); assert.equal(h.loading(), true); await h.settle();
    assert.ok(h.text().includes(news[0].headline)); assert.ok(!h.text().includes('temporarily unavailable'));
    assert.equal(h.timers.size, 0);
  });
}

test('a price failure cannot hide successfully loaded news', async () => {
  const h = harness(async url => url.includes('type=news') ? Response.json(news) : Response.json({}, { status: 503 }));
  await h.settle(); assert.equal(h.loading(), false); assert.ok(h.text().includes(news[0].headline));
  assert.ok(h.text().includes('Price data is temporarily unavailable.')); assert.ok(!h.text().includes('$0.00'));
});

for (const field of ['c', 'd', 'dp', 'h']) {
  test(`malformed quote ${field} cannot crash the modal`, async () => {
    const h = harness(async url => Response.json(url.includes('type=news') ? news : { quote: { ...quote.quote, [field]: 'invalid' } }));
    await h.settle(); assert.ok(h.text().includes(news[0].headline)); assert.ok(h.text().includes('Price data is temporarily unavailable.'));
  });
}

test('a valid empty news response is distinct from a failed request', async () => {
  const h = harness(async url => Response.json(url.includes('type=news') ? [] : quote));
  await h.settle(); assert.ok(h.text().includes('No recent news found.')); assert.ok(!h.text().includes('Try again'));
});

for (const stage of ['news headers', 'news body', 'quote headers', 'quote body']) {
  test(`${stage}: ignored aborts cannot leave loading active past the ten-second deadline`, async () => {
    let release; const held = new Promise(resolve => { release = resolve; });
    const h = harness(async url => {
      const isNews = url.includes('type=news'), target = stage.startsWith('news') === isNews;
      if (!target) return Response.json(isNews ? news : quote);
      return stage.endsWith('headers') ? held : { ok: true, json: () => held };
    });
    await h.settle(); assert.ok([...h.timers.values()].every(timer => timer.ms === 10000));
    if (stage.startsWith('quote')) { assert.equal(h.loading(), false); assert.ok(h.text().includes(news[0].headline)); }
    h.timeout(); await h.settle(); assert.equal(h.loading(), false);
    assert.ok(h.text().includes(stage.startsWith('news') ? 'Stock news took too long.' : 'Price data took too long.'));
    assert.ok(h.requests.every(request => request.signal.aborted));
    release(stage.endsWith('headers') ? Response.json(news) : news); await h.settle();
    assert.ok(h.text().includes('took too long')); assert.equal(h.timers.size, 0);
  });
}

test('late results for a previous symbol cannot replace the new symbol state', async () => {
  let release; const held = new Promise(resolve => { release = resolve; });
  const h = harness(async url => url.includes('symbol=AAPL') ? held : Response.json(url.includes('type=news') ? [{ ...news[0], headline: 'MSFT current headline' }] : quote));
  h.switch('MSFT'); await h.settle(); assert.ok(h.text().includes('MSFT current headline'));
  release(Response.json(news)); await h.settle(); assert.ok(!h.text().includes('Actual provider headline'));
  assert.ok(h.requests.filter(request => request.url.includes('symbol=AAPL')).every(request => request.signal.aborted));
});

test('closing the modal cancels timers and prevents late state writes', async () => {
  let release; const held = new Promise(resolve => { release = resolve; });
  const h = harness(() => held); h.close(); const before = h.updates();
  release(Response.json(news)); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.updates(), before); assert.equal(h.timers.size, 0); assert.ok(h.requests.every(request => request.signal.aborted));
});

test('a late quote from a failed attempt cannot overwrite a successful retry', async () => {
  let release; const held = new Promise(resolve => { release = resolve; });
  const h = harness(async url => url.includes('type=news') ? Response.json({}, { status: 500 }) : held);
  await h.settle();
  h.respond(async url => Response.json(url.includes('type=news') ? news : quote));
  h.retry(); await h.settle();
  release(Response.json({ quote: { ...quote.quote, c: 999 } })); await h.settle();
  assert.ok(h.text().includes('125.00')); assert.ok(!h.text().includes('999.00')); assert.ok(h.text().includes(news[0].headline));
});
