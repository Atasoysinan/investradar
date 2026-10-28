import { Redis } from '@upstash/redis';

// EVAL executes against one shared Redis primary, never a regional read cache.
// All windows use Redis TTLs, so clock skew between function instances is harmless.
const CLIENT_SCRIPT = `
local count = tonumber(redis.call('GET', KEYS[1]) or '0')
if count >= 5 then
  local ttl = redis.call('PTTL', KEYS[1])
  if ttl == 0 then return 1 end
  return ttl
end
if redis.call('INCR', KEYS[1]) == 1 then redis.call('PEXPIRE', KEYS[1], 600000) end
return 0
`;
const ATTEMPT_SCRIPT = `
local cooldown = redis.call('PTTL', KEYS[1])
if cooldown > 0 then return {1, cooldown} end
local count = tonumber(redis.call('GET', KEYS[2]) or '0')
if count >= 3 then return {2, redis.call('PTTL', KEYS[2])} end
local global = tonumber(redis.call('GET', KEYS[3]) or '0')
if global >= 20 then return {3, redis.call('PTTL', KEYS[3])} end
redis.call('SET', KEYS[1], 1, 'PX', 60000)
if redis.call('INCR', KEYS[2]) == 1 then redis.call('PEXPIRE', KEYS[2], 3600000) end
if redis.call('INCR', KEYS[3]) == 1 then redis.call('PEXPIRE', KEYS[3], 60000) end
return {0, 0}
`;

export function createSubscriptionRateLimit(redis: Redis, prefix: string) {
  return {
    async client(clientHash: string): Promise<number> {
      const result = await redis.eval<[], number>(CLIENT_SCRIPT, [`${prefix}:client:${clientHash}`], []);
      if (!Number.isFinite(result) || result < 0) throw new Error('Invalid limiter response');
      return result;
    },
    async attempt(emailHash: string): Promise<{ reason: number; retryAfter: number }> {
      const result = await redis.eval<[], number[]>(ATTEMPT_SCRIPT, [
        `${prefix}:cooldown:${emailHash}`, `${prefix}:email:${emailHash}`, `${prefix}:global`,
      ], []);
      if (!Array.isArray(result) || result.length !== 2 || !result.every(Number.isFinite)
        || result[0] < 0 || result[0] > 3 || result[1] < 0) throw new Error('Invalid limiter response');
      return { reason: result[0], retryAfter: result[1] };
    },
  };
}

export function getSubscriptionRateLimit() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('Subscription limiter unavailable');
  const redis = new Redis({
    url, token, retry: { retries: 0 }, enableAutoPipelining: false,
    signal: () => AbortSignal.timeout(3000),
  });
  // Production and local/preview traffic must never consume each other's quota.
  const environment = process.env.VERCEL_ENV === 'production' ? 'production'
    : process.env.VERCEL_ENV === 'preview' ? 'preview' : 'development';
  return createSubscriptionRateLimit(redis, `investradar:subscribe:v1:${environment}`);
}
