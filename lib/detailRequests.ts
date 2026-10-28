import { newsArticles } from '@/lib/newsProvider';
import { cache } from 'react';
import { headers } from 'next/headers';
import { checkDataRateLimit } from '@/lib/dataRateLimit';
import { createDataRequest, fetchJson } from '@/lib/dataRequest';

// React cache is scoped to one server render, never shared across visitors.
const detailRequest = cache(async () => {
  const incoming = await headers();
  return new Request('https://www.investradar.live/detail', {
    headers: { 'x-vercel-forwarded-for': incoming.get('x-vercel-forwarded-for') || '' },
  });
});

async function admit(group: 'market' | 'news', cost: number): Promise<string> {
  try {
    const response = await checkDataRateLimit(await detailRequest(), group, cost);
    if (!response) return '';
    return response.status === 429 ? 'Too many data requests. Please try again shortly.'
      : 'Data service is temporarily unavailable. Please try again.';
  } catch {
    return 'Data service is temporarily unavailable. Please try again.';
  }
}

export const loadStockMarket = cache(async (symbol: string) => {
  const issue = await admit('market', 2);
  if (issue) return { quote: null, profile: null, read: null, issue };
  const read = createDataRequest();
  const key = process.env.FINNHUB_KEY;
  const [quote, profile] = await Promise.allSettled([
    read(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${key}`, { next: { revalidate: 60 } }),
    read(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${key}`, { next: { revalidate: 3600 } }),
  ]);
  return { quote: quote.status === 'fulfilled' ? quote.value : null,
    profile: profile.status === 'fulfilled' ? profile.value : null, read, issue: '' };
});

// Metadata and the crypto page share both admission and the provider result.
export const loadCryptoMarket = cache(async (id: string) => {
  const issue = await admit('market', 1);
  if (issue) return { data: null, read: null, issue };
  const read = createDataRequest();
  const data = await read(
    `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`,
    { headers: { Accept: 'application/json' }, next: { revalidate: 60 } },
  ).catch(() => null);
  return { data, read, issue: '' };
});

export async function loadDetailNews(query: string, read: typeof fetchJson) {
  const issue = await admit('news', 1);
  if (issue) return { data: null, issue };
  const domains = 'reuters.com,apnews.com,wsj.com,ft.com,cnbc.com,bloomberg.com,forbes.com,marketwatch.com,businessinsider.com,seekingalpha.com,benzinga.com';
  const unavailable = () => ({ data: null, issue: 'News is temporarily unavailable. Please try again.' });
  const key = process.env.NEWSAPI_KEY;
  if (!key) return unavailable();
  try {
    const data = await read(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&domains=${domains}&language=en&sortBy=publishedAt&pageSize=5&apiKey=${key}`,
      { next: { revalidate: 300 } },
    );
    return { data: { articles: newsArticles(data) }, issue: '' };
  } catch {
    return unavailable();
  }
}
