import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRowRoute, mixedProvider, healthyArticle } from './support/news-row-routes.mjs';
for (const name of ['topic-news', 'trending']) {
  test(`${name}: mixed null and healthy rows retain successful response`, async () => {
    const h = loadRowRoute(name, mixedProvider); const response = await h.run(); const body = await response.json();
    assert.equal(response.status, 200);
    if (name === 'topic-news') for (const key of ['markets', 'tech', 'geopolitics']) assert.equal(body[key].length, 1);
    else { assert.deepEqual(body.trending.map(row => row.symbol), ['AAPL', 'BTC-USD']); assert.equal(body.trending[0].dp, 0); assert.equal(body.trending[1].price, null); assert.equal(body.coins.length, 1); assert.equal(body.coins[0].current_price, null); assert.equal(body.reddit.length, 1); }
  });
  for (const payload of [null, false, 42, [], {}, { articles: {} }, { articles: [null, {}, 2] }, { finance: { result: [{ quotes: {} }] } }]) {
    test(`${name}: malformed payload ${JSON.stringify(payload)} is isolated`, async () => {
      const response = await loadRowRoute(name, async () => payload).run(); assert.equal(response.status, name === 'trending' && Array.isArray(payload) ? 200 : 503);
      const body = await response.json(); for (const value of Object.values(body)) if (Array.isArray(value)) assert.equal(value.length, 0);
    });
  }
  test(`${name}: rate rejection skips all sources`, async () => {
    const h = loadRowRoute(name, mixedProvider, new Response(null, { status: 429 })); assert.equal((await h.run()).status, 429); assert.equal(h.calls.length, 0);
  });
}
test('topic-news: malformed source and optional fields normalize safely', async () => {
  const body = await (await loadRowRoute('topic-news', async () => ({ articles: [null, { ...healthyArticle, source: null, description: {}, urlToImage: 3, publishedAt: null }] })).run()).json();
  assert.equal(body.markets.length, 1); assert.deepEqual(body.markets[0].source, { name: '' }); assert.equal(body.markets[0].description, '');
});
test('topic-news: existing source deduplication and four-item cap remain', async () => {
  const body = await (await loadRowRoute('topic-news', async () => ({ articles: [healthyArticle, healthyArticle, ...Array.from({ length: 8 }, (_, i) => ({ ...healthyArticle, source: { name: `Source ${i}` } }))] })).run()).json();
  assert.equal(body.markets.length, 4); assert.equal(new Set(body.markets.map(a => a.source.name)).size, 4);
});
test('trending: bad Yahoo container preserves Reddit and CoinGecko', async () => {
  const body = await (await loadRowRoute('trending', url => url.includes('yahoo') ? { finance: { result: [null] } } : mixedProvider(url)).run()).json();
  assert.equal(body.trending.length, 0); assert.equal(body.coins.length, 1); assert.equal(body.reddit.length, 1);
});
test('trending: bad coin rows do not consume healthy list slots', async () => {
  const body = await (await loadRowRoute('trending', url => url.includes('/coins/markets') ? [...Array(12).fill(null), ...Array.from({ length: 12 }, (_, i) => ({ id: String(i), symbol: 'btc', name: 'Bitcoin', current_price: 10, price_change_percentage_24h: 0 }))] : mixedProvider(url)).run()).json();
  assert.equal(body.coins.length, 10); assert.equal(body.coins[0].price_change_percentage_24h, 0);
});
for (const quote of [null, {}, { bitcoin: null }, { bitcoin: { usd: '123', usd_24h_change: {} } }]) test(`trending: malformed crypto price ${JSON.stringify(quote)} stays unknown`, async () => {
  const body = await (await loadRowRoute('trending', url => url.includes('/simple/price') ? quote : mixedProvider(url)).run()).json();
  assert.equal(body.trending[1].price, null); assert.equal(body.trending[1].dp, null);
});
