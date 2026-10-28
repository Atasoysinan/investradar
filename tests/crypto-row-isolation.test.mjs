import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRowRoute } from './support/news-row-routes.mjs';
const coin = { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', image: 'https://example.com/bitcoin.png', current_price: 123, price_change_percentage_24h: 0, market_cap: 456, total_volume: 789 };
const get = payload => loadRowRoute('crypto', async () => payload).run();
const invalidRows = [null, false, 2, 'bad', [], {}, { ...coin, id: null }, { ...coin, name: '' }, { ...coin, symbol: {} }, { ...coin, image: 'javascript:alert(1)' }, { ...coin, current_price: null }, { ...coin, current_price: '123' }, { ...coin, current_price: 0 }, { ...coin, current_price: Infinity }, { ...coin, market_cap: -1 }, { ...coin, total_volume: null }, { ...coin, price_change_percentage_24h: {} }, { ...coin, price_change_percentage_24h: NaN }];
for (const [index, invalid] of invalidRows.entries()) test(`invalid crypto row ${index} cannot discard healthy rows`, async () => {
  const response = await get([invalid, coin, { ...coin, id: 'ethereum', name: 'Ethereum', price_change_percentage_24h: null }]);
  assert.equal(response.status, 200); assert.equal(response.headers.get('x-market-data-partial'), 'true'); assert.equal(response.headers.get('cache-control'), 'no-store');
  const rows = await response.json(); assert.equal(rows.length, 2); assert.deepEqual(rows[0], coin); assert.equal(rows[1].price_change_percentage_24h, null);
});
for (const payload of [null, {}, { error: 'private provider detail' }, [null, {}]]) test(`invalid crypto payload ${JSON.stringify(payload)} returns generic failure`, async () => {
  const response = await get(payload); assert.equal(response.status, 502); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.ok(!(await response.text()).includes('private'));
});
test('healthy null/zero changes and zero volume/cap are retained', async () => {
  const response = await get([coin, { ...coin, price_change_percentage_24h: null, market_cap: 0, total_volume: 0 }]);
  assert.equal(response.status, 200); assert.equal(response.headers.get('x-market-data-partial'), null); const rows = await response.json(); assert.equal(rows[0].price_change_percentage_24h, 0); assert.equal(rows[1].price_change_percentage_24h, null); assert.equal(rows[1].total_volume, 0);
});
test('missing change normalizes to null without discarding a healthy coin', async () => {
  const { price_change_percentage_24h: _change, ...row } = coin; void _change;
  const response = await get([row]); assert.equal((await response.json())[0].price_change_percentage_24h, null);
});
test('valid empty list stays successful', async () => { const response = await get([]); assert.equal(response.status, 200); assert.deepEqual(await response.json(), []); });
test('rate limit still prevents provider access', async () => { const h = loadRowRoute('crypto', () => { throw Error('unexpected'); }, new Response(null, { status: 429 })); assert.equal((await h.run()).status, 429); assert.equal(h.calls.length, 0); });
test('provider failures return controlled error', async () => { const response = await loadRowRoute('crypto', async () => { throw Error('private'); }).run(); assert.equal(response.status, 502); });
