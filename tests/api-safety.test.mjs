import { newsArticles } from '../lib/newsProvider.ts';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { decodeHtml } from './support/decode-html.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../app/api/subscribe/route.ts', import.meta.url), 'utf8');

function handler({ key = 'test-key', contactError = false, emailError = false, throws = false } = {}) {
  const calls = [];
  class Resend {
    constructor() {
      if (throws) throw new Error('private provider detail');
    }
    contacts = { create: async () => {
      calls.push('contact');
      return contactError ? { error: { message: 'private detail' }, data: null } : { error: null, data: { id: 'contact' } };
    } };
    emails = { send: async () => {
      calls.push('email');
      return emailError ? { error: { message: 'private detail' }, data: null } : { error: null, data: { id: 'email' } };
    } };
  }
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, AbortController, setTimeout, clearTimeout,
    process: { env: { VERCEL_ENV: 'production', RESEND_API_KEY: key } },
    require: (name) => {
      if (name === '@/lib/newsProvider') return { newsArticles };
      if (name === 'node:crypto') return { createHash };
      if (name === 'node:net') return { isIP };
      if (name === 'next/server') return { NextResponse: Response };
      if (name === 'resend') return { Resend };
      if (name === '@/lib/subscriptionRateLimit') return { getSubscriptionRateLimit: () => ({ client: async () => 0, attempt: async () => ({ reason: 0, retryAfter: 0 }) }) };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { post: (body) => exports.POST(new Request('https://example.test/api/subscribe', { method: 'POST', body })), calls };
}

test('malformed JSON is rejected before contacting the provider', async () => {
  const { post, calls } = handler();
  assert.equal((await post('{')).status, 400);
  assert.deepEqual(calls, []);
});

test('invalid JSON shapes and non-string emails return 400', async () => {
  for (const body of [null, [], {}, { email: 42 }, { email: ['a@example.com'] }, { email: 'bad' }]) {
    const { post, calls } = handler();
    assert.equal((await post(JSON.stringify(body))).status, 400);
    assert.deepEqual(calls, []);
  }
});

test('missing configuration returns 503 without provider calls', async () => {
  const { post, calls } = handler({ key: '' });
  assert.equal((await post('{"email":"a@example.com"}')).status, 503);
  assert.deepEqual(calls, []);
});

test('contact failure prevents sending a welcome email and hides provider details', async () => {
  const { post, calls } = handler({ contactError: true });
  const response = await post('{"email":"a@example.com"}');
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, 'Failed to subscribe.');
  assert.deepEqual(calls, ['contact']);
});

test('welcome failure reports partial completion rather than success', async () => {
  const { post, calls } = handler({ emailError: true });
  const response = await post('{"email":"a@example.com"}');
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /Subscription saved/);
  assert.deepEqual(calls, ['contact', 'email']);
});

test('client initialization exceptions produce a controlled response', async () => {
  const { post } = handler({ throws: true });
  const response = await post('{"email":"a@example.com"}');
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, 'Failed to subscribe.');
});

test('success requires both provider operations to succeed', async () => {
  const { post, calls } = handler();
  const response = await post('{"email":"a@example.com"}');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  assert.deepEqual(calls, ['contact', 'email']);
});

test('Mediastack credentials use HTTPS and redirects are rejected', async () => {
  const newsSource = readFileSync(new URL('../app/api/news/route.ts', import.meta.url), 'utf8');
  let options;
  const exports = {};
  vm.runInNewContext(ts.transpileModule(newsSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, AbortController, setTimeout, clearTimeout, URL, Date, console, AbortController, setTimeout, clearTimeout,
    process: { env: { MEDIASTACK_KEY: 'test-key' } },
    require: name => name === '@/lib/newsProvider' ? { newsArticles } : name === '@/lib/dataRateLimit' ? { checkDataRateLimit: async () => null } : name === '@/lib/decodeHtml' ? { decodeHtml } : ({ NextResponse: Response }),
    fetch: async (url, init) => {
      if (String(url).includes('api.mediastack.com')) {
        assert.equal(new URL(url).protocol, 'https:');
        options = init;
      }
      return { json: async () => ({}), text: async () => '' };
    },
  });
  await exports.GET(new Request('https://example.test/api/news'));
  assert.ok(options, 'Mediastack request must be exercised');
  assert.equal(options.redirect, 'error');
});
