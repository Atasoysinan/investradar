import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../app/api/subscribe/route.ts', import.meta.url), 'utf8');
const MINUTE = 60_000;
function harness({ vercel = false, sharedLimit = { client: async () => 0, attempt: async () => ({ reason: 0, retryAfter: 0 }) } } = {}) {
  let now = 0, contactError = false, emailError = false, hold, emailHold, failConstructor = false;
  const contacts = [], emails = [], contactOptions = [];
  const timers = new Map(); const scheduled = []; let timerId = 0;
  class Clock extends Date { static now() { return now; } }
  class Resend {
    constructor() { if (failConstructor) throw new Error('private'); }
    contacts = { create: async (payload, options) => {
      contactOptions.push(options);
      contacts.push(payload);
      if (hold) await hold;
      return contactError ? { data: null, error: { message: 'private' } } : { data: { id: 'contact' }, error: null };
    } };
    emails = { send: async (payload, options) => {
      emails.push({ payload, options });
      if (emailHold) await emailHold;
      return emailError ? { data: null, error: { message: 'private' } } : { data: { id: 'email' }, error: null };
    } };
  }
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, Date: Clock, AbortController,
    setTimeout(callback, ms) { scheduled.push(ms); const id = ++timerId; timers.set(id, { callback, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    process: { env: { VERCEL_ENV: 'production', RESEND_API_KEY: 'test-key', VERCEL: vercel ? '1' : undefined } },
    require: name => {
      if (name === 'node:crypto') return { createHash };
      if (name === 'node:net') return { isIP };
      if (name === 'resend') return { Resend };
      if (name === '@/lib/subscriptionRateLimit') return { getSubscriptionRateLimit: () => sharedLimit };
      if (name === 'next/server') return { NextResponse: Response };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return {
    contacts, emails, contactOptions, timers, scheduled,
    timeout() { for (const { callback } of [...timers.values()]) callback(); },
    post(email, ip = '203.0.113.1', extraHeaders = {}) {
      return exports.POST(new Request('https://example.test/api/subscribe', { method: 'POST', headers: { 'x-vercel-forwarded-for': ip, ...extraHeaders }, body: JSON.stringify({ email }) }));
    },
    invalid() { return exports.POST(new Request('https://example.test/api/subscribe', { method: 'POST', body: '{' })); },
    advance(ms) { now += ms; },
    errors(contact, email) { contactError = contact; emailError = email; },
    constructorError(value) { failConstructor = value; },
    holdEmail() { let release; emailHold = new Promise(resolve => { release = resolve; }); return release; },
    holdContact() { let release; hold = new Promise(resolve => { release = resolve; }); return release; },
  };
}

test('limits a client to five requests in ten minutes and exposes Retry-After', async () => {
  const h = harness();
  for (let i = 0; i < 5; i++) assert.equal((await h.post(`user${i}@example.test`)).status, 200);
  const blocked = await h.post('blocked@example.test');
  assert.equal(blocked.status, 429); assert.equal(blocked.headers.get('retry-after'), '600');
  assert.equal(h.emails.length, 5);
  h.advance(10 * MINUTE);
  assert.equal((await h.post('after-window@example.test')).status, 200);
});

test('malformed requests consume the same client budget without sending email', async () => {
  const h = harness();
  for (let i = 0; i < 5; i++) assert.equal((await h.invalid()).status, 400);
  assert.equal((await h.post('later@example.test')).status, 429);
  assert.equal(h.contacts.length, 0); assert.equal(h.emails.length, 0);
});

test('non-Vercel deployments ignore spoofed IP headers', async () => {
  const h = harness();
  for (let i = 0; i < 5; i++) await h.post(`user${i}@example.test`, `203.0.113.${i + 1}`);
  assert.equal((await h.post('blocked@example.test', '203.0.113.99', { 'x-forwarded-for': '198.51.100.7' })).status, 429);
});

test('Vercel client limits remain separate and do not trust a conflicting X-Forwarded-For', async () => {
  const h = harness({ vercel: true });
  for (let i = 0; i < 5; i++) await h.post(`user${i}@example.test`);
  assert.equal((await h.post('blocked@example.test', '203.0.113.1', { 'x-forwarded-for': '198.51.100.7' })).status, 429);
  assert.equal((await h.post('other@example.test', '203.0.113.2')).status, 200);
});

test('normalizes email and returns cached success without another contact or welcome email', async () => {
  const h = harness();
  assert.equal((await h.post('  Alice@Example.TEST  ')).status, 200);
  assert.equal((await h.post('alice@example.test')).status, 200);
  assert.equal(h.contacts.length, 1); assert.equal(h.emails.length, 1);
  assert.equal(h.emails[0].payload.to, 'alice@example.test');
  assert.ok(!h.emails[0].options.idempotencyKey.includes('alice'));
});

test('concurrent submissions for one email cannot run duplicate provider operations', async () => {
  const h = harness(); const release = h.holdContact();
  const first = h.post('alice@example.test');
  await new Promise(resolve => setImmediate(resolve));
  const repeated = await h.post('ALICE@example.test');
  assert.equal(repeated.status, 409); assert.equal(repeated.headers.get('retry-after'), '5');
  assert.equal(h.contacts.length, 1); assert.equal(h.emails.length, 0);
  release(); assert.equal((await first).status, 200); assert.equal(h.emails.length, 1);
});

test('failed contact attempts can retry after the cooldown and are not cached as success', async () => {
  const h = harness(); h.errors(true, false);
  assert.equal((await h.post('alice@example.test')).status, 502);
  h.errors(false, false);
  const tooSoon = await h.post('alice@example.test');
  assert.equal(tooSoon.status, 429); assert.equal(tooSoon.headers.get('retry-after'), '60');
  h.advance(MINUTE);
  assert.equal((await h.post('alice@example.test')).status, 200);
  assert.equal(h.contacts.length, 2); assert.equal(h.emails.length, 1);
});

test('welcome failure retries only the email step using the same provider idempotency key', async () => {
  const h = harness(); h.errors(false, true);
  assert.equal((await h.post('alice@example.test')).status, 502);
  h.errors(false, false); h.advance(MINUTE);
  assert.equal((await h.post('alice@example.test')).status, 200);
  assert.equal(h.contacts.length, 1); assert.equal(h.emails.length, 2);
  assert.equal(h.emails[0].options.idempotencyKey, h.emails[1].options.idempotencyKey);
});

test('email attempt limit cannot be bypassed by changing clients and resets after an hour', async () => {
  const h = harness({ vercel: true }); h.errors(true, false);
  for (let i = 0; i < 3; i++) { assert.equal((await h.post('alice@example.test', `203.0.113.${i + 1}`)).status, 502); h.advance(MINUTE); }
  assert.equal((await h.post('alice@example.test', '203.0.113.4')).status, 429);
  assert.equal(h.contacts.length, 3);
  h.advance(60 * MINUTE);
  assert.equal((await h.post('alice@example.test', '203.0.113.4')).status, 502);
});

test('per-process burst cap stops twenty-one different clients from triggering provider work', async () => {
  const h = harness({ vercel: true });
  for (let i = 0; i < 20; i++) assert.equal((await h.post(`user${i}@example.test`, `203.0.113.${i + 1}`)).status, 200);
  const blocked = await h.post('blocked@example.test', '203.0.113.100');
  assert.equal(blocked.status, 429); assert.equal(blocked.headers.get('retry-after'), '60'); assert.equal(h.emails.length, 20);
  h.advance(MINUTE);
  assert.equal((await h.post('after-window@example.test', '203.0.113.100')).status, 200);
});

test('cached success expires but idempotency keys do not change at calendar boundaries or across processes', async () => {
  const first = harness(); await first.post('alice@example.test');
  first.advance(24 * 60 * MINUTE - 1);
  await first.post('alice@example.test'); assert.equal(first.emails.length, 1);
  first.advance(1); await first.post('alice@example.test'); assert.equal(first.emails.length, 2);
  const other = harness(); other.advance(24 * 60 * MINUTE); await other.post('ALICE@example.test');
  assert.equal(first.emails[0].options.idempotencyKey, first.emails[1].options.idempotencyKey);
  assert.equal(first.emails[0].options.idempotencyKey, other.emails[0].options.idempotencyKey);
});

test('initialization exceptions release the in-flight lock for later retry', async () => {
  const h = harness(); h.constructorError(true);
  assert.equal((await h.post('alice@example.test')).status, 500);
  h.constructorError(false); h.advance(MINUTE);
  assert.equal((await h.post('alice@example.test')).status, 200);
});

test('rejects invalid and excessively long addresses without provider calls', async () => {
  const h = harness();
  for (const value of [null, ['alice@example.test'], 'bad', `${'a'.repeat(250)}@example.test`]) assert.equal((await h.post(value)).status, 400);
  assert.equal(h.contacts.length, 0); assert.equal(h.emails.length, 0);
});

for (const stage of ['contact', 'email']) {
  test(`${stage} timeout aborts the request, releases the lock and allows a safe retry`, async () => {
    const h = harness();
    const release = stage === 'contact' ? h.holdContact() : h.holdEmail();
    const first = h.post('timeout@example.test');
    await new Promise(resolve => setImmediate(resolve));
    h.advance(10_000); h.timeout();
    const response = await first;
    assert.equal(response.status, 504);
    assert.equal(response.headers.get('retry-after'), '50');
    assert.match((await response.json()).error, /timed out/);
    assert.equal(h.contactOptions[0].signal.aborted, true);
    assert.equal(h.timers.size, 0);
    assert.equal((await h.post('timeout@example.test')).status, 429);
    release(); h.advance(MINUTE);
    assert.equal((await h.post('timeout@example.test')).status, 200);
    assert.equal(h.contacts.length, stage === 'contact' ? 2 : 1);
    if (stage === 'email') assert.equal(h.emails[0].options.idempotencyKey, h.emails[1].options.idempotencyKey);
  });
}

test('expired leases recover even if the timer has not fired; late work cannot unlock a newer attempt', async () => {
  const h = harness(); const releaseOld = h.holdContact();
  const old = h.post('lease@example.test');
  await new Promise(resolve => setImmediate(resolve));
  h.advance(MINUTE);
  const releaseNew = h.holdContact(); const newer = h.post('lease@example.test');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.contactOptions[0].signal.aborted, true);
  assert.equal(h.contacts.length, 2);
  releaseOld(); assert.equal((await old).status, 504);
  assert.equal(h.emails.length, 0);
  assert.equal((await h.post('lease@example.test')).status, 409);
  releaseNew(); assert.equal((await newer).status, 200);
  assert.equal(h.emails.length, 1); assert.equal(h.timers.size, 0);
});

test('contact and email share one total deadline and successful calls clear timers', async () => {
  const h = harness(); const release = h.holdContact();
  const pending = h.post('budget@example.test');
  await new Promise(resolve => setImmediate(resolve));
  h.advance(6000); release();
  assert.equal((await pending).status, 200);
  assert.deepEqual(h.scheduled, [10_000, 4000]);
  assert.equal(h.timers.size, 0);
});

test('expired abandoned entries can be reclaimed after the cache TTL', async () => {
  const h = harness(); const release = h.holdContact();
  const old = h.post('expired@example.test');
  await new Promise(resolve => setImmediate(resolve));
  h.advance(25 * 60 * MINUTE); release();
  const retry = h.post('expired@example.test');
  assert.equal((await old).status, 504);
  assert.equal((await retry).status, 200);
});

for (const stage of ['client', 'attempt']) {
  test(`shared ${stage} failure closes admission without contacting the email provider`, async () => {
    const sharedLimit = { client: async () => 0, attempt: async () => ({ reason: 0, retryAfter: 0 }) };
    sharedLimit[stage] = async () => { throw new Error('private Redis connection details'); };
    const h = harness({ sharedLimit });
    const response = await h.post('redis-failure@example.test');
    assert.equal(response.status, 503); assert.equal(response.headers.get('retry-after'), '60');
    assert.equal((await response.json()).error, 'Subscription service is temporarily unavailable. Please try again later.');
    assert.equal(h.contacts.length, 0); assert.equal(h.emails.length, 0);
  });
}

test('shared client rejection is enforced before parsing or provider work', async () => {
  const h = harness({ sharedLimit: { client: async () => 123456, attempt: async () => { throw new Error('must not reserve'); } } });
  const response = await h.invalid();
  assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '124');
  assert.equal(h.contacts.length, 0);
});

for (const reason of [1, 2, 3]) {
  test(`shared attempt rejection ${reason} preserves Retry-After and sends no email`, async () => {
    const h = harness({ sharedLimit: { client: async () => 0, attempt: async () => ({ reason, retryAfter: 54321 }) } });
    const response = await h.post('blocked@example.test');
    assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '55');
    assert.equal(h.contacts.length, 0); assert.equal(h.emails.length, 0);
  });
}


test('welcome mail uses the production domain and a stable sender migration key', async () => {
  const first = harness(); const restarted = harness();
  assert.equal((await first.post('sender@example.test')).status, 200);
  assert.equal((await restarted.post('sender@example.test')).status, 200);
  assert.equal(first.emails[0].payload.from, 'InvestRadar <newsletter@investradar.live>');
  assert.match(first.emails[0].options.idempotencyKey, /^newsletter-welcome\/v2\/[a-f0-9]{64}$/);
  assert.equal(first.emails[0].options.idempotencyKey, restarted.emails[0].options.idempotencyKey);
});
