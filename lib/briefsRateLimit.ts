import { Redis } from '@upstash/redis';

// One primary-side operation checks all budgets before admitting any work.
const LIMIT_SCRIPT = `
local limits = {5, 10, 100}
local windows = {60000, 60000, 3600000}
local retry = 0
for i = 1, 3 do
  local count = tonumber(redis.call('GET', KEYS[i]) or '0')
  if count >= limits[i] then
    local ttl = redis.call('PTTL', KEYS[i])
    if ttl < 0 then return -1 end
    retry = math.max(retry, math.max(1, ttl))
  end
end
if retry > 0 then return retry end
for i = 1, 3 do
  if redis.call('INCR', KEYS[i]) == 1 then redis.call('PEXPIRE', KEYS[i], windows[i]) end
end
return 0
`;

export function createBriefsRateLimit(redis: Redis, prefix: string) {
  return {
    async limit(clientHash: string): Promise<number> {
      const result = await redis.eval<[], number>(LIMIT_SCRIPT, [
        `${prefix}:client:${clientHash}`, `${prefix}:minute`, `${prefix}:hour`,
      ], []);
      if (!Number.isFinite(result) || result < 0) throw new Error('Invalid AI limiter response');
      return result;
    },
  };
}

export function getBriefsRateLimit() {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('AI limiter unavailable');
  const redis = new Redis({ url, token, retry: { retries: 0 }, enableAutoPipelining: false,
    signal: () => AbortSignal.timeout(3000) });
  const environment = process.env.VERCEL_ENV === 'production' ? 'production'
    : process.env.VERCEL_ENV === 'preview' ? 'preview' : 'development';
  return createBriefsRateLimit(redis, `investradar:briefs:v1:${environment}`);
}
