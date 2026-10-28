import { newsArticles } from '../lib/newsProvider.ts';
import { loadDataRequest } from './support/data-request.mjs';
import { decodeHtml } from './support/decode-html.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../app/api/news/route.ts', import.meta.url), 'utf8');
const article = { title: 'Nvidia announces new chips', url: 'https://example.test/story', publishedAt: '2026-10-23T10:00:00Z' };
const fields = { 'newsapi.org': 'articles', 'gnews.io': 'articles', 'newsdata.io': 'results', 'api.mediastack.com': 'data' };

function newsHandler(fetcher, timeoutMs) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, URL, Date, AbortController,
    setTimeout: (callback, ms) => setTimeout(callback, timeoutMs ?? ms), clearTimeout,
    process: { env: Object.fromEntries(['NEWSAPI_KEY', 'GNEWS_KEY', 'NEWSDATA_KEY', 'MEDIASTACK_KEY'].map(key => [key, 'test-key'])) },
    require: name => name === '@/lib/newsProvider' ? { newsArticles } : name === '@/lib/dataRateLimit' ? { checkDataRateLimit: async () => null } : name === '@/lib/decodeHtml' ? { decodeHtml } : ({ NextResponse: Response }),
    fetch: fetcher,
  });
  return query => exports.GET(new Request(`https://example.test/api/news${query || ''}`));
}

for (const [host, field] of Object.entries(fields)) {
  test(`${host}: malformed list cannot break healthy providers`, async () => {
    for (const malformed of [{ message: 'quota exceeded' }, 'invalid', null]) {
      const get = newsHandler(async url => {
        const provider = fields[new URL(url).hostname];
        if (!provider) return new Response('', { status: 503 });
        return Response.json({ [provider]: new URL(url).hostname === host ? malformed : [article] });
      });
      const response = await get('?q=Nvidia');
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.status, 'ok');
      assert.ok(data.articles.length > 0, `${field} must not prevent fallback`);
    }
  });
}

test('invalid article entries are skipped and optional fields are normalized', async () => {
  const get = newsHandler(async url => {
    const field = fields[new URL(url).hostname];
    if (!field) return new Response('', { status: 503 });
    return Response.json({ [field]: [null, 42, {}, { title: {} }, { ...article, description: {}, source: 12, image: [] }] });
  });
  const response = await get();
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.ok(data.articles.length);
  assert.equal(data.articles[0].description, '');
  assert.equal(typeof data.articles[0].source.name, 'string');
});

test('HTTP errors and invalid JSON do not discard healthy RSS articles', async () => {
  const get = newsHandler(async url => {
    const host = new URL(url).hostname;
    if (host === 'newsapi.org') return Response.json({ articles: [article] }, { status: 500 });
    if (fields[host]) return new Response('invalid json');
    return new Response('<rss><channel><item><title>Nvidia RSS fallback</title><link>https://example.test/rss</link></item></channel></rss>');
  });
  const response = await get('?q=Nvidia');
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.ok(data.articles.length);
  assert.ok(data.articles.every(a => a.title === 'Nvidia RSS fallback'));
});

test('complete outage returns a controlled JSON error without private details', async () => {
  const get = newsHandler(async () => { throw new Error('private provider details'); });
  const response = await get();
  assert.equal(response.status, 503);
  const data = await response.json();
  assert.equal(data.status, 'error');
  assert.deepEqual(data.articles, []);
  assert.equal(data.message, 'News is temporarily unavailable. Please try again.');
});

test('a successful search with no matches remains a valid empty result', async () => {
  const get = newsHandler(async url => {
    const field = fields[new URL(url).hostname];
    return field ? Response.json({ [field]: [article] }) : new Response('', { status: 503 });
  });
  const response = await get('?q=does-not-match');
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).articles, []);
});

test('the news UI hides HTTP, JSON parsing and provider error details', async () => {
  const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  for (const response of [
    () => new Response('', { status: 500 }),
    () => new Response('invalid JSON'),
    () => Response.json({ status: 'error', message: 'private provider details' }),
  ]) {
    const updates = [];
    const effects = [];
    const exports = {};
    vm.runInNewContext(ts.transpileModule(page, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText, {
      exports, URL, Date, AbortController,
    setTimeout: (callback, ms) => setTimeout(callback, timeoutMs ?? ms), clearTimeout, AbortController,
      setInterval: () => 0, clearInterval: () => {},
      window: { addEventListener: () => {}, removeEventListener: () => {} },
      fetch: async url => url.startsWith('/api/news?') ? response() : Response.json({}),
      require: name => {
      if (name === '@/lib/newsProvider') return { newsArticles };
        if (name === '@/lib/dataRequest') return loadDataRequest(async () => Response.json({}));
        if (name === '@/lib/decodeHtml') return { decodeHtml };
        if (name === 'react') return {
          useMemo: fn => fn(),
          useState: initial => [initial, value => updates.push(value)],
          useRef: initial => ({ current: initial }),
          useEffect: effect => effects.push(effect),
        };
        if (name === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null };
        return { default: () => null };
      },
    });
    exports.default();
    const cleanup = effects.map(effect => effect());
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(updates.includes('News is temporarily unavailable. Please try again.'));
    assert.ok(!updates.some(value => typeof value === 'string' && /private|Unexpected|JSON/.test(value)));
    cleanup.forEach(fn => fn?.());
  }
});

test('news stock pills remain renderable when the market API returns an error object', async () => {
  const pills = readFileSync(new URL('../components/StockPills.tsx', import.meta.url), 'utf8');
  for (const status of [200, 500]) {
    const state = [];
    let cursor = 0;
    const effects = [];
    const exports = {};
    vm.runInNewContext(ts.transpileModule(pills, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText, {
      exports, AbortController,
      fetch: async () => Response.json({ error: 'API key not configured' }, { status }),
      require: name => {
      if (name === '@/lib/newsProvider') return { newsArticles };
        if (name === '@/lib/dataRequest') return loadDataRequest(async () => Response.json({ error: 'API key not configured' }, { status }));
        if (name === '@/lib/decodeHtml') return { decodeHtml };
        if (name === 'react') return {
          useMemo: fn => fn(),
          useState: initial => {
            const index = cursor++;
            if (!(index in state)) state[index] = initial;
            return [state[index], value => { state[index] = value; }];
          },
          useEffect: effect => effects.push(effect),
        };
        if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
        if (name === '@/lib/stockMentions') return { extractTickers: () => ['NVDA'] };
        return { default: () => null };
      },
    });
    const child = exports.default({ headline: 'Nvidia', description: '' });
    child.type(child.props);
    effects[0]();
    await new Promise(resolve => setImmediate(resolve));
    cursor = 0;
    assert.doesNotThrow(() => child.type(child.props));
    assert.equal(state[0].length, 0);
    assert.equal(state[1], false);
  }
});

test('API decodes numeric entities in both JSON and RSS headlines', async () => {
  const get = newsHandler(async url => {
    const field = fields[new URL(url).hostname];
    if (field) return Response.json({ [field]: [{ ...article, title: 'Apple&#x2019;s profits &#8212; rise', description: 'It&amp;#039;s growing' }] });
    return new Response('<rss><channel><item><title><![CDATA[Market&#039;s rally &amp; gains]]></title><link>https://example.test/rss</link></item></channel></rss>');
  });
  const response = await get();
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.ok(data.articles.some(a => a.title === 'Apple’s profits — rise' && a.description === "It's growing"));
  assert.ok(data.articles.some(a => a.title === "Market's rally & gains"));
});

for (const slowHost of [...Object.keys(fields), 'feeds.bbci.co.uk']) {
  for (const phase of ['fetch', 'body']) {
    test(`${slowHost}: timeout during ${phase} preserves healthy sources and aborts only the slow source`, async () => {
      const calls = [];
      const get = newsHandler(async (url, options) => {
        const host = new URL(url).hostname;
        calls.push({ host, signal: options.signal });
        const field = fields[host];
        if (host === slowHost) {
          if (phase === 'fetch') return new Promise(() => {});
          return { ok: true, json: () => new Promise(() => {}), text: () => new Promise(() => {}) };
        }
        return field ? Response.json({ [field]: [article] }) : new Response('<rss><channel></channel></rss>');
      }, 25);
      const started = performance.now();
      const response = await get('?region=europe');
      assert.ok(performance.now() - started < 1000, 'slow source must not block the response');
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.ok(data.articles.some(a => a.title === article.title));
      assert.ok(calls.some(call => call.host === slowHost), 'slow source must be exercised');
      assert.ok(calls.filter(call => call.host === slowHost).every(call => call.signal.aborted));
      assert.ok(calls.filter(call => call.host !== slowHost).every(call => !call.signal.aborted));
    });
  }
}

test('when every source hangs, the response completes with a controlled 503', async () => {
  const signals = [];
  const get = newsHandler(async (_url, options) => { signals.push(options.signal); return new Promise(() => {}); }, 25);
  const started = performance.now();
  const response = await get();
  assert.ok(performance.now() - started < 1000);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).message, 'News is temporarily unavailable. Please try again.');
  assert.ok(signals.every(signal => signal.aborted));
});

test('deadlines are cleared after successful requests, including successful empty feeds', async () => {
  const signals = [];
  const get = newsHandler(async (url, options) => {
    signals.push(options.signal);
    const field = fields[new URL(url).hostname];
    return field ? Response.json({ [field]: [article] }) : new Response('<rss><channel></channel></rss>');
  }, 25);
  assert.equal((await get()).status, 200);
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.ok(signals.every(signal => !signal.aborted));
});

for (const errorBody of [{ status: 'error', articles: [], results: [], data: [] }, { success: false, articles: [], results: [], data: [] }, { error: { message: 'private quota details' }, articles: [], results: [], data: [] }]) {
  test(`provider error envelopes and HTML feeds cannot masquerade as an empty success: ${JSON.stringify(errorBody)}`, async () => {
    const get = newsHandler(async url => fields[new URL(url).hostname] ? Response.json(errorBody) : new Response('<html>private provider error page</html>'));
    const response = await get(); assert.equal(response.status, 503); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.ok(!(await response.text()).includes('private'));
  });
}
test('valid empty provider and RSS responses remain successful', async () => {
  const get = newsHandler(async url => { const field = fields[new URL(url).hostname]; return field ? Response.json({ [field]: [] }) : new Response('<rss><channel></channel></rss>'); });
  const response = await get(); assert.equal(response.status, 200); assert.deepEqual((await response.json()).articles, []); assert.equal(response.headers.get('x-news-data-partial'), null);
});
test('partial provider failure is visible without discarding healthy news', async () => {
  const get = newsHandler(async url => new URL(url).hostname === 'newsapi.org' ? Response.json({ articles: [article] }) : new Response('unavailable', { status: 503 }));
  const response = await get(); assert.equal(response.status, 200); assert.equal(response.headers.get('x-news-data-partial'), 'true'); assert.ok((await response.json()).articles.length > 0);
});

for (const date of [undefined, '', 'invalid-date', null]) test(`missing/invalid provider date ${String(date)} stays unknown and not live`, async () => {
  const get = newsHandler(async url => fields[new URL(url).hostname] ? Response.json({ [fields[new URL(url).hostname]]: [{ ...article, publishedAt: date }] }) : new Response('', { status: 503 }));
  const response = await get(); const rows = (await response.json()).articles;
  assert.equal(response.status, 200); assert.ok(rows.length); assert.ok(rows.every(row => row.publishedAt === '' && row.isLive === false));
});
for (const date of ['', '<pubDate>not-a-date</pubDate>']) test('RSS without a usable date stays unknown and not live', async () => {
  const get = newsHandler(async url => fields[new URL(url).hostname] ? new Response('', { status: 503 }) : new Response(`<rss><channel><item><title>Undated market story</title><link>https://example.test/undated</link>${date}</item></channel></rss>`));
  const rows = (await (await get()).json()).articles; assert.ok(rows.length); assert.ok(rows.every(row => row.publishedAt === '' && row.isLive === false));
});
test('known publication dates sort newest first with undated articles last', async () => {
  const rows = [ { ...article, title:'Undated financial story', publishedAt:'' }, { ...article, title:'Earlier earnings announcement', publishedAt:'2026-01-01T00:00:00Z' }, { ...article, title:'Recent technology development', publishedAt:'2026-02-01T00:00:00Z' } ];
  const get = newsHandler(async url => new URL(url).hostname === 'newsapi.org' ? Response.json({ articles: rows }) : new Response('', { status: 503 }));
  assert.deepEqual((await (await get()).json()).articles.map(row=>row.title), ['Recent technology development','Earlier earnings announcement','Undated financial story']);
});
test('only a real publication in the past hour is live', async () => {
  const now = Date.now();
  const get = newsHandler(async url => new URL(url).hostname === 'newsapi.org' ? Response.json({ articles:[{...article,title:'Recent finance announcement',publishedAt:new Date(now-60000).toISOString()},{...article,title:'Old technology release',publishedAt:new Date(now-7200000).toISOString()},{...article,title:'Future market forecast',publishedAt:new Date(now+3600000).toISOString()}] }) : new Response('', {status:503}));
  const rows = (await (await get()).json()).articles; assert.equal(rows.find(r=>r.title.startsWith('Recent')).isLive,true); assert.equal(rows.find(r=>r.title.startsWith('Old')).isLive,false); assert.equal(rows.find(r=>r.title.startsWith('Future')).isLive,false);
});

async function atomResponse(xml) {
  return newsHandler(async url => url === 'https://www.theverge.com/rss/index.xml'
    ? new Response(xml) : new Response('', { status: 503 }))();
}
const atomFeed = entries => `<feed xmlns="http://www.w3.org/2005/Atom"><title>The Verge feed</title><updated>2026-10-28T18:00:00Z</updated>${entries}</feed>`;
test('Atom: article link, HTML title, summary, image and original publication date', async () => {
  const response = await atomResponse(atomFeed(`<entry><title type="html">Google&#8217;s &amp; Xreal launch</title>
    <link rel="self" href="https://example.test/entry.xml"/><link type='text/html' href='https://www.theverge.com/story?a=1&amp;b=2' rel='alternate'/>
    <published>2026-10-27T12:00:00-04:00</published><updated>2026-10-28T18:00:00Z</updated>
    <summary type="html">&lt;p&gt;Launch &amp; details&lt;/p&gt;</summary><content type="html"><![CDATA[<img src="https://example.test/photo.jpg?a=1&amp;b=2"/>]]></content></entry>`));
  assert.equal(response.status, 200);
  const [article] = (await response.json()).articles;
  assert.equal(article.title, 'Google’s & Xreal launch');
  assert.equal(article.url, 'https://www.theverge.com/story?a=1&b=2');
  assert.equal(article.publishedAt, '2026-10-27T16:00:00.000Z');
  assert.equal(article.description, 'Launch & details');
  assert.equal(article.urlToImage, 'https://example.test/photo.jpg?a=1&b=2');
  assert.equal(article.source.name, 'The Verge');
});
test('Atom: prefixed namespace, default alternate link and content keep publication date unknown', async () => {
  const response = await atomResponse(`<atom:feed xmlns:atom='http://www.w3.org/2005/Atom'><atom:entry>
    <atom:title><![CDATA[Technology &amp; markets]]></atom:title><atom:link href="https://www.theverge.com/prefixed"/>
    <atom:updated>2026-10-27T10:00:00Z</atom:updated><atom:content type="html">&lt;p&gt;Details&lt;/p&gt;</atom:content>
    </atom:entry></atom:feed>`);
  const [article] = (await response.json()).articles;
  assert.equal(article.title, 'Technology & markets'); assert.equal(article.description, 'Details');
  assert.equal(article.publishedAt, ''); assert.equal(article.isLive, false);
});
test('Atom: malformed entries are skipped, self and enclosure links are not article links', async () => {
  const response = await atomResponse(atomFeed(`<entry><title>Self only</title><link rel="self" href="https://example.test/self"/></entry>
    <entry><title>Enclosure only</title><link rel="enclosure" href="https://example.test/file"/></entry>
    <entry><title>Unsafe link</title><link href="javascript:alert(1)"/></entry>
    <entry><link href="https://example.test/missing-title"/></entry>
    <entry><title>Healthy entry survives</title><link href="https://www.theverge.com/healthy"/></entry>`));
  const rows = (await response.json()).articles;
  assert.equal(rows.length, 1); assert.equal(rows[0].title, 'Healthy entry survives');
  assert.equal(rows[0].publishedAt, ''); assert.equal(rows[0].isLive, false);
});
test('Atom: invalid publication date is not replaced with current or modification time', async () => {
  const response = await atomResponse(atomFeed('<entry><title>Unknown publication date</title><link href="https://www.theverge.com/unknown"/><published>invalid</published><updated>2026-10-28T18:00:00Z</updated></entry>'));
  const [article] = (await response.json()).articles;
  assert.equal(article.publishedAt, ''); assert.equal(article.isLive, false);
});
test('Atom: only ten entries are consumed per feed', async () => {
  const response = await atomResponse(atomFeed(Array.from({ length: 12 }, (_, i) => `<entry><title>Distinct${i} news</title><link href="https://www.theverge.com/story${i}"/></entry>`).join('')));
  assert.equal((await response.json()).articles.length, 10);
});
test('Atom: valid empty feed is distinct from an unavailable or incomplete feed', async () => {
  assert.equal((await atomResponse(atomFeed(''))).status, 200);
  assert.equal((await atomResponse('<feed xmlns="http://www.w3.org/2005/Atom">')).status, 503);
  assert.equal((await atomResponse('<html><entry>Not Atom</entry></html>')).status, 503);
});


test('Atom: recently updated entry without publication is neither dated nor LIVE', async () => {
  const response = await atomResponse(atomFeed(`<entry><title>Older edited article</title><link href="https://www.theverge.com/edited"/><updated>${new Date().toISOString()}</updated></entry>`));
  const [article] = (await response.json()).articles;
  assert.equal(article.publishedAt, ''); assert.equal(article.isLive, false);
});
for (const entries of [
  '<entry><title>No link</title></entry>',
  '<entry><link href="https://example.test/no-title"/></entry>',
  '<entry><title>Unsafe</title><link href="javascript:alert(1)"/></entry>',
  '<entry/>',
  '<entry><title>Unclosed entry</title>',
]) test(`Atom: nonempty unusable feed fails: ${entries}`, async () => {
  const response = await atomResponse(atomFeed(entries));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).status, 'error');
});
test('Atom: unusable feed signals partial failure while another source survives', async () => {
  const get = newsHandler(async url => new URL(url).hostname === 'www.theverge.com'
    ? new Response(atomFeed('<entry><title>No link</title></entry>'))
    : new URL(url).hostname === 'newsapi.org' ? Response.json({ articles: [article] }) : new Response('', { status: 503 }));
  const response = await get();
  assert.equal(response.status, 200); assert.equal(response.headers.get('x-news-data-partial'), 'true');
  assert.equal((await response.json()).articles.length, 1);
});
test('RSS: nonempty unusable items cannot masquerade as a successful empty feed', async () => {
  const get = newsHandler(async url => new URL(url).hostname === 'www.theverge.com'
    ? new Response('<rss><channel><item><title>No link</title></item></channel></rss>') : new Response('', { status: 503 }));
  assert.equal((await get()).status, 503);
});
