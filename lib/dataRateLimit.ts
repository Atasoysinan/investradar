import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

type Group = 'market' | 'news';
const BUDGETS = { market: [240, 1200], news: [30, 300] } as const;
const SCRIPT = `
local cost = tonumber(ARGV[1])
local retry = 0
for i = 1, 2 do
  local count = tonumber(redis.call('GET', KEYS[i]) or '0')
  if count + cost > tonumber(ARGV[i + 1]) then
    local ttl = redis.call('PTTL', KEYS[i])
    if ttl < 0 then return -1 end
    retry = math.max(retry, math.max(1, ttl))
  end
end
if retry > 0 then return retry end
for i = 1, 2 do
  if redis.call('INCRBY', KEYS[i], cost) == cost then redis.call('PEXPIRE', KEYS[i], 60000) end
end
return 0
`;

export function createDataRateLimit(redis: Redis, prefix: string) {
  return async (group: Group, clientHash: string, cost = 1): Promise<number> => {
    if (!Number.isInteger(cost) || cost < 1 || cost > 30) throw new Error('Invalid admission cost');
    const result = await redis.eval<(number)[], number>(SCRIPT,
      [`${prefix}:${group}:client:${clientHash}`, `${prefix}:${group}:global`], [cost, ...BUDGETS[group]]);
    if (!Number.isFinite(result) || result < 0) throw new Error('Invalid data limiter response');
    return result;
  };
}

export async function checkDataRateLimit(request: Request, group: Group, cost = 1) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
    if (!url || !token) throw new Error('Data limiter unavailable');
    const redis = new Redis({ url, token, retry: { retries: 0 }, enableAutoPipelining: false,
      signal: () => AbortSignal.timeout(3000) });
    const environment = process.env.VERCEL_ENV === 'production' ? 'production'
      : process.env.VERCEL_ENV === 'preview' ? 'preview' : 'development';
    const forwarded = process.env.VERCEL === '1' ? request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim() : undefined;
    const client = createHash('sha256').update(forwarded && isIP(forwarded) ? forwarded : 'unknown-client').digest('hex');
    const retryAfter = await Promise.race([
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Data limiter timed out')), 3000); }),
      createDataRateLimit(redis, `investradar:data:v1:${environment}`)(group, client, cost),
    ]);
    if (retryAfter > 0) return NextResponse.json({ error: 'Too many data requests. Please try again shortly.' }, {
      status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(Math.max(1, Math.ceil(retryAfter / 1000))) },
    });
    return null;
  } catch {
    return NextResponse.json({ error: 'Data service is temporarily unavailable. Please try again.' }, {
      status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' },
    });
  } finally { clearTimeout(timer); }
}
