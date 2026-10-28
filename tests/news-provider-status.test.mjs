import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRowRoute, healthyArticle } from './support/news-row-routes.mjs';
const endpoints = ['global-news', 'topic-news', 'breaking-news'];
for (const endpoint of endpoints) {
  for (const payload of [null, {}, { status: 'error', message: 'private-key-details', articles: [] }, { errors: ['private'], articles: [] }, { error: { message: 'private' }, articles: [] }, { success: false, articles: [] }, { articles: [null] }]) {
    test(`${endpoint}: provider error ${JSON.stringify(payload)} is unavailable`, async () => {
      const response = await loadRowRoute(endpoint, async () => payload).run();
      assert.equal(response.status, 503); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('retry-after'), '30');
      const text = await response.text(); assert.equal(JSON.parse(text).status, 'error'); assert.ok(!text.includes('private'));
    });
  }
  test(`${endpoint}: transport failure is unavailable`, async () => {
    const response = await loadRowRoute(endpoint, async () => { throw new Error('private transport detail'); }).run(); assert.equal(response.status, 503);
  });
  test(`${endpoint}: valid empty result remains a success`, async () => {
    const response = await loadRowRoute(endpoint, async () => ({ articles: [] })).run(); assert.equal(response.status, 200);
    assert.ok(Object.values(await response.json()).every(value => Array.isArray(value) && value.length === 0));
  });
  test(`${endpoint}: missing credentials return generic 503 before provider access`, async () => {
    const route = loadRowRoute(endpoint, async () => { throw new Error('must not fetch'); }, null, {});
    const response = await route.run(); assert.equal(response.status, 503); assert.equal(route.calls.length, 0); assert.ok(!(await response.text()).includes('API key'));
  });
}
test('topic-news: failed category is signaled while healthy news survives', async () => {
  let count = 0;
  const response = await loadRowRoute('topic-news', async () => ++count === 1 ? { status: 'error', articles: [] } : { articles: [{ ...healthyArticle, source: { name: String(count) } }] }).run();
  assert.equal(response.status, 200); assert.equal(response.headers.get('x-news-data-partial'), 'true'); const body = await response.json(); assert.equal(body.markets.length, 0); assert.equal(body.tech.length, 1); assert.equal(body.geopolitics.length, 1);
});
test('breaking-news: fallback recovery is signaled', async () => {
  let count = 0; const response = await loadRowRoute('breaking-news', async () => ++count === 1 ? { status: 'error', articles: [] } : { articles: [healthyArticle] }).run();
  assert.equal(response.status, 200); assert.equal(response.headers.get('x-news-data-partial'), 'true'); assert.equal((await response.json()).articles.length, 1);
});
test('breaking-news: confirmed empty primary survives failed fallback', async () => {
  let count = 0; const response = await loadRowRoute('breaking-news', async () => ++count === 1 ? { articles: [] } : { status: 'error' }).run();
  assert.equal(response.status, 200); assert.equal(response.headers.get('x-news-data-partial'), 'true'); assert.deepEqual(await response.json(), { articles: [] });
});
