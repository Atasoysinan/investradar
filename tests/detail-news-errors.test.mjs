import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detailNewsPage } from './support/detail-news-pages.mjs';
const story = { title: 'Healthy provider story', url: 'https://example.com/story', description: 'News', publishedAt: '2026-10-28T00:00:00Z', source: { name: 'Fixture' } };
for (const kind of ['stock', 'crypto']) {
  for (const news of [null, {}, { status: 'error', message: 'private', articles: [] }, { error: 'private', articles: [] }, { articles: {} }, { articles: [null] }]) test(`${kind}: malformed/error news shows generic failure and keeps price`, async () => {
    const html = await detailNewsPage({ news }).render(kind);
    assert.ok(html.includes('News is temporarily unavailable. Please try again.')); assert.ok(html.includes(kind === 'stock' ? '$125.00' : '$65,000.00')); assert.ok(!html.includes('private'));
  });
  test(`${kind}: rejected news request shows failure without hiding market data`, async () => { const html = await detailNewsPage({ reject: true }).render(kind); assert.ok(html.includes('News is temporarily unavailable')); assert.ok(html.includes(kind === 'stock' ? '$125.00' : '$65,000.00')); assert.ok(!html.includes('private')); });
  test(`${kind}: missing key skips news provider and shows generic message`, async () => { const h = detailNewsPage({ missingKey: true }); const html = await h.render(kind); assert.ok(html.includes('News is temporarily unavailable')); assert.ok(!h.calls.some(url => url.includes('newsapi'))); });
  test(`${kind}: valid empty news is not reported as provider failure`, async () => { const html = await detailNewsPage().render(kind); assert.ok(!html.includes('News is temporarily unavailable')); assert.ok(!html.includes('News could not be loaded')); });
  test(`${kind}: healthy news and mixed null rows remain visible`, async () => { const html = await detailNewsPage({ news: { articles: [null, story] } }).render(kind); assert.ok(html.includes('Healthy provider story')); assert.ok(!html.includes('News could not be loaded')); });
  test(`${kind}: news admission still blocks provider calls`, async () => { const h = detailNewsPage({ blocked: true }); const html = await h.render(kind); assert.ok(html.includes('Too many data requests')); assert.ok(!h.calls.some(url => url.includes('newsapi'))); });
}
