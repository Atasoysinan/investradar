import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getToken } from 'next-auth/jwt';

for (const authorization of ['Bearer %', 'Bearer %E0%A4%A', 'Bearer %FF']) {
  test(`NextAuth rejects malformed URL-encoded token ${authorization} without throwing`, async () => {
    assert.equal(await getToken({
      req: { headers: { authorization }, cookies: {} },
      secret: 'isolated-test-secret',
    }), null);
  });
}

test('NextAuth normalizes Unicode before rejecting a second email separator', async () => {
  const { createRequire } = await import('node:module');
  const { dirname, join } = await import('node:path');
  const require = createRequire(import.meta.url);
  const signin = require(join(dirname(require.resolve('next-auth')), 'core/routes/signin.js')).default;
  let adapterCalls = 0;
  const result = await signin({
    body: { email: 'victim@trusted.test＠attacker.test' }, query: {},
    options: {
      url: 'https://example.test/api/auth',
      provider: { type: 'email', id: 'email' },
      logger: { error() {} },
      adapter: { async getUserByEmail() { adapterCalls++; throw new Error('Must reject before accessing accounts'); } },
      callbacks: { async signIn() { throw new Error('Must reject before authorization'); } },
    },
  });
  assert.equal(result.redirect, 'https://example.test/api/auth/error?error=EmailSignin');
  assert.equal(adapterCalls, 0);
});
