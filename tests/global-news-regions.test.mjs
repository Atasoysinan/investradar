import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRowRoute } from './support/news-row-routes.mjs';
const regionOf = url => { const q = new URL(url).searchParams.get('q'); return q.includes('Americas') ? 'americas' : q.includes('Europe') ? 'europe' : 'asia'; };
const row = region => ({ title: `${region} economy news`, description: `${region} markets`, url: `https://example.com/${region}`, image: 'https://example.com/news.jpg', publishedAt: '2026-10-28T00:00:00Z', source: { name: region } });
test('separate subject searches map responses to their own regions despite reversed completion', async () => {
  const pending = new Map();
  const h = loadRowRoute('global-news', url => new Promise(resolve => pending.set(regionOf(url), resolve)));
  const response = h.run(); await new Promise(resolve => setImmediate(resolve));
  for (const region of ['asia', 'europe', 'americas']) pending.get(region)({ articles: [row(region)] });
  const body = await (await response).json();
  assert.equal(h.calls.length, 3);
  for (const region of ['americas', 'europe', 'asia']) {
    assert.equal(body[region].length, 1); assert.equal(body[region][0].title, `${region} economy news`); assert.equal(body[region][0].urlToImage, 'https://example.com/news.jpg');
  }
  for (const [url, options] of h.calls) {
    const parsed = new URL(url), params = parsed.searchParams;
    assert.equal(parsed.pathname, '/api/v4/search'); assert.ok(params.get('q').length <= 200);
    assert.match(params.get('q'), /AND \(business OR economy OR markets OR finance\)/);
    assert.equal(params.get('in'), 'title,description'); assert.equal(params.get('max'), '3'); assert.equal(params.has('country'), false); assert.equal(options.next.revalidate, 1800);
  }
});
for (const failed of ['americas', 'europe', 'asia']) test(`${failed} failure cannot be filled from another region`, async () => {
  const response = await loadRowRoute('global-news', async url => { const region = regionOf(url); if (region === failed) throw new Error('private provider detail'); return { articles: [row(region)] }; }).run();
  assert.equal(response.status, 200); assert.equal(response.headers.get('x-news-data-partial'), 'true');
  const body = await response.json(); assert.deepEqual(body[failed], []);
  for (const region of ['americas', 'europe', 'asia'].filter(r => r !== failed)) assert.equal(body[region][0].title, `${region} economy news`);
});
test('valid empty region remains empty while another region has news', async () => {
  const response = await loadRowRoute('global-news', async url => ({ articles: regionOf(url) === 'asia' ? [] : [row(regionOf(url))] })).run();
  assert.equal(response.status, 200); assert.equal(response.headers.get('x-news-data-partial'), null); const body = await response.json(); assert.deepEqual(body.asia, []); assert.equal(body.europe.length, 1);
});
test('each region independently caps and normalizes mixed article rows', async () => {
  const response = await loadRowRoute('global-news', async url => ({ articles: [null, ...Array.from({ length: 5 }, () => ({ ...row(regionOf(url)), description: null, source: null }))] })).run();
  const body = await response.json(); for (const rows of Object.values(body)) { assert.equal(rows.length, 3); assert.equal(rows[0].description, ''); assert.deepEqual(rows[0].source, { name: '' }); }
});
