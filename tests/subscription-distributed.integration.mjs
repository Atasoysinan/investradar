import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { Redis } from '@upstash/redis';

const source = readFileSync(new URL('../lib/subscriptionRateLimit.ts', import.meta.url), 'utf8');
const exports = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports, process, AbortSignal, require: () => ({ Redis }),
});
const hash = value => createHash('sha256').update(value).digest('hex');
const makeRedis = () => new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN, retry: { retries: 0 }, enableAutoPipelining: false, signal: () => AbortSignal.timeout(3000) });
async function fixture(run) {
  const prefix = `investradar:test:${randomUUID()}`;
  const redis = makeRedis();
  const a = exports.createSubscriptionRateLimit(redis, prefix);
  const b = exports.createSubscriptionRateLimit(makeRedis(), prefix);
  try { await run({ a, b, redis, prefix }); }
  finally {
    const keys = await redis.keys(`${prefix}:*`);
    if (keys.length) await redis.del(...keys);
  }
}

test('independent instances share the five-request client quota atomically', () => fixture(async ({ a, b, redis, prefix }) => {
  const ip = hash('test-client');
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? a : b).client(ip)));
  assert.equal(results.filter(value => value === 0).length, 5);
  assert.ok(results.filter(value => value > 0).every(value => value <= 600000));
  assert.equal(await redis.get(`${prefix}:client:${ip}`), 5);
  await redis.pexpire(`${prefix}:client:${ip}`, 1000);
  await new Promise(resolve => setTimeout(resolve, 1500));
  assert.equal(await b.client(ip), 0);
}));

test('email cooldown and hourly quota are shared across instances', () => fixture(async ({ a, b, redis, prefix }) => {
  const email = hash('shared@example.test');
  const results = await Promise.all([a.attempt(email), b.attempt(email)]);
  assert.equal(results.filter(result => result.reason === 0).length, 1);
  assert.equal(results.filter(result => result.reason === 1).length, 1);
  for (let i = 0; i < 2; i++) {
    await redis.del(`${prefix}:cooldown:${email}`);
    assert.equal((await b.attempt(email)).reason, 0);
  }
  await redis.del(`${prefix}:cooldown:${email}`);
  const blocked = await a.attempt(email);
  assert.equal(blocked.reason, 2); assert.ok(blocked.retryAfter > 0);
  assert.equal(await redis.get(`${prefix}:email:${email}`), 3);
}));

test('global quota admits exactly twenty concurrent operations across independent instances', () => fixture(async ({ a, b, redis, prefix }) => {
  const results = await Promise.all(Array.from({ length: 35 }, (_, i) => (i % 2 ? a : b).attempt(hash(`user${i}@example.test`))));
  assert.equal(results.filter(result => result.reason === 0).length, 20);
  assert.equal(results.filter(result => result.reason === 3).length, 15);
  assert.equal(await redis.get(`${prefix}:global`), 20);
  const blockedIndex = results.findIndex(result => result.reason === 3);
  assert.equal(await redis.get(`${prefix}:email:${hash(`user${blockedIndex}@example.test`)}`), null);
  assert.equal(await redis.exists(`${prefix}:cooldown:${hash(`user${blockedIndex}@example.test`)}`), 0);
}));

test('environment namespaces do not consume one another’s quotas', () => fixture(async ({ a, redis, prefix }) => {
  const other = exports.createSubscriptionRateLimit(makeRedis(), `${prefix}:preview`);
  const ip = hash('same-client');
  for (let i = 0; i < 5; i++) assert.equal(await a.client(ip), 0);
  assert.ok(await a.client(ip) > 0);
  assert.equal(await other.client(ip), 0);
  assert.ok(await redis.pttl(`${prefix}:client:${ip}`) > 0);
}));
