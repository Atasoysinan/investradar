import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

const bots = new Set(['unknown', 'google', 'bing', 'ai-crawler', 'seo', 'social', 'automation', 'other-bot', 'unclassified']);
const endpoints = new Set(['/', '/markets', '/videos', '/robots.txt', '/sitemap.xml', '/[other]',
  '/stocks/[ticker]', '/crypto/[id]', '/api/auth/[...nextauth]', '/api/[other]',
  ...['briefs', 'breaking-news', 'penny', 'market', 'trending', 'etfs', 'global-news', 'news', 'subscribe',
    'stocktwits-feed', 'stocktwits', 'topic-news', 'sectors', 'crypto'].map(name => `/api/${name}`)]);

export function createTrafficReport() {
  const buckets = new Map();
  let accepted = 0, ignored = 0;
  return {
    add(line) {
      try {
        let record = JSON.parse(line);
        if (typeof record?.message === 'string') record = JSON.parse(record.message);
        let coverage = 'full-v1';
        if (Array.isArray(record)) {
          if (record.length !== 8 || record[0] !== 'ir.req' || record[1] !== 2) { ignored++; return; }
          const [, , day, environment, endpoint, method, bot, kind] = record;
          record = { event: 'investradar.request', version: 1, day, environment, endpoint, method, bot, kind, count: 1 };
          coverage = 'selective-v2';
        }
        if (record?.event !== 'investradar.request' || record.version !== 1 || record.count !== 1
          || typeof record.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(record.day)
          || new Date(`${record.day}T00:00:00Z`).toISOString().slice(0, 10) !== record.day
          || !['production', 'preview', 'development'].includes(record.environment)
          || !endpoints.has(record.endpoint) || !bots.has(record.bot)
          || !['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'OTHER'].includes(record.method)
          || !['api', 'page', 'prefetch', 'rsc'].includes(record.kind)) { ignored++; return; }
        const dimensions = { day: record.day, environment: record.environment, coverage, endpoint: record.endpoint,
          bot: record.bot, method: record.method, kind: record.kind };
        const key = JSON.stringify(dimensions);
        const bucket = buckets.get(key) || { ...dimensions, requests: 0 };
        bucket.requests++; buckets.set(key, bucket); accepted++;
      } catch { ignored++; }
    },
    result() {
      const rows = [...buckets.values()].sort((a, b) => a.day.localeCompare(b.day) || b.requests - a.requests
        || JSON.stringify(a).localeCompare(JSON.stringify(b)));
      const daily = new Map();
      for (const row of rows) {
        const key = `${row.day}:${row.environment}:${row.coverage}`;
        const day = daily.get(key) || { day: row.day, environment: row.environment, coverage: row.coverage, requests: 0 };
        day.requests += row.requests; daily.set(key, day);
      }
      return { timezone: 'UTC', accepted, ignored, daily: [...daily.values()], breakdown: rows };
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = createTrafficReport();
  for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    if (line.trim()) report.add(line);
  }
  console.log(JSON.stringify(report.result(), null, 2));
}
