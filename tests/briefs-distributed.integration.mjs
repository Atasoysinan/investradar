import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { Redis } from '@upstash/redis';
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/briefsRateLimit.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, process, AbortSignal, require: () => ({ Redis }) });
const redisClient = () => new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN,
  retry: { retries: 0 }, enableAutoPipelining: false, signal: () => AbortSignal.timeout(3000) });
const hash = value => createHash('sha256').update(value).digest('hex');
async function fixture(run) {
  const prefix = `investradar:test:briefs:${randomUUID()}`, redis = redisClient();
  try {
    await run({ prefix, redis, a: exports.createBriefsRateLimit(redis, prefix), b: exports.createBriefsRateLimit(redisClient(), prefix) });
  } finally {
    const keys = await redis.keys(`${prefix}:*`); if (keys.length) await redis.del(...keys);
  }
}

test('two independent AI instances admit only five concurrent requests from one client', () => fixture(async ({ a, b, redis, prefix }) => {
  const key = hash('one-client');
  const results = await Promise.all(Array.from({ length: 15 }, (_, i) => (i % 2 ? a : b).limit(key)));
  assert.equal(results.filter(value => value === 0).length, 5); assert.ok(results.filter(value => value > 0).every(value => value <= 60000));
  assert.equal(await redis.get(`${prefix}:minute`), 5); assert.equal(await redis.get(`${prefix}:hour`), 5);
  await redis.pexpire(`${prefix}:client:${key}`, 1000); await new Promise(resolve => setTimeout(resolve, 1500));
  assert.equal(await b.limit(key), 0);
}));

test('global AI minute quota is atomic across clients and instances', () => fixture(async ({ a, b, redis, prefix }) => {
  const results = await Promise.all(Array.from({ length: 25 }, (_, i) => (i % 2 ? a : b).limit(hash(`client-${i}`))));
  assert.equal(results.filter(value => value === 0).length, 10); assert.equal(await redis.get(`${prefix}:minute`), 10);
  assert.equal(await redis.get(`${prefix}:hour`), 10);
  const blocked = results.findIndex(value => value > 0); assert.equal(await redis.get(`${prefix}:client:${hash(`client-${blocked}`)}`), null);
}));

test('global hourly AI budget blocks new clients without consuming their quotas', () => fixture(async ({ a, redis, prefix }) => {
  await redis.set(`${prefix}:hour`, 100, { px: 3600000 });
  const blocked = await a.limit(hash('hourly-client')); assert.ok(blocked > 0 && blocked <= 3600000);
  assert.equal(await redis.get(`${prefix}:minute`), null);
  assert.equal(await redis.get(`${prefix}:client:${hash('hourly-client')}`), null);
}));

test('AI limiter namespaces are isolated from other environments', () => fixture(async ({ a, redis, prefix }) => {
  const otherPrefix = prefix+':preview', other = exports.createBriefsRateLimit(redisClient(), otherPrefix), key = hash('same');
  try {
    for (let i = 0; i < 5; i++) assert.equal(await a.limit(key), 0);
    assert.ok(await a.limit(key) > 0); assert.equal(await other.limit(key), 0);
  } finally {
    const keys = await redis.keys(otherPrefix+':*'); if (keys.length) await redis.del(...keys);
  }
}));
