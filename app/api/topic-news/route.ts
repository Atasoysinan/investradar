import { newsArticles } from '@/lib/newsProvider';
import { fetchJson } from '@/lib/dataRequest';
import { checkDataRateLimit } from '@/lib/dataRateLimit';
import { socialRecord } from '@/lib/socialData';
import { NextResponse } from 'next/server';

const DOMAINS = 'reuters.com,apnews.com,wsj.com,ft.com,cnbc.com,bloomberg.com,forbes.com,marketwatch.com,businessinsider.com,economist.com,bbc.co.uk,bbc.com,theguardian.com,nytimes.com,washingtonpost.com,politico.com,axios.com,thehill.com,investing.com,seekingalpha.com,benzinga.com';

interface NewsArticle {
  title: string;
  description: string;
  url: string;
  urlToImage: string;
  publishedAt: string;
  source: { name: string };
}


export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const limited = await checkDataRateLimit(request, 'news', 1);
  if (limited) return limited;
  const KEY = process.env.NEWSAPI_KEY;
  if (!KEY) return unavailable();

  const base = `https://newsapi.org/v2/everything?language=en&sortBy=publishedAt&domains=${DOMAINS}&apiKey=${KEY}`;

  const [marketsResult, techResult, geoResult] = await Promise.allSettled([
    fetchJson(
      `${base}&q=${encodeURIComponent('stock market OR earnings OR fed reserve OR interest rates')}&pageSize=4`,
      { next: { revalidate: 1800 } }
    ).then(data => newsArticles(data)),
    fetchJson(
      `${base}&q=${encodeURIComponent('artificial intelligence OR tech stocks OR semiconductor OR OpenAI OR NVIDIA')}&pageSize=4`,
      { next: { revalidate: 1800 } }
    ).then(data => newsArticles(data)),
    fetchJson(
      `${base}&q=${encodeURIComponent('geopolitics OR trade war OR sanctions OR global economy OR GDP')}&pageSize=4`,
      { next: { revalidate: 1800 } }
    ).then(data => newsArticles(data)),
  ]);

  const seen = new Set<string>();
  function getUnique(articles: NewsArticle[]): NewsArticle[] {
    const result: NewsArticle[] = [];
    for (const a of articles) {
      const src = a.source?.name ?? '';
      if (!seen.has(src)) { seen.add(src); result.push(a); }
      if (result.length >= 4) break;
    }
    return result;
  }

  const extract = (result: PromiseSettledResult<unknown>): NewsArticle[] => {
    if (result.status !== 'fulfilled') return [];
    const articles = result.value;
    if (!Array.isArray(articles)) return [];
    return getUnique(articles.flatMap((value): NewsArticle[] => {
      const row = socialRecord(value);
      if (typeof row.title !== 'string' || !row.title.trim() || row.title === '[Removed]'
        || typeof row.url !== 'string' || !row.url.trim()) return [];
      const source = socialRecord(row.source);
      return [{ title: row.title, url: row.url,
        description: typeof row.description === 'string' ? row.description : '',
        urlToImage: typeof row.urlToImage === 'string' ? row.urlToImage : '',
        publishedAt: typeof row.publishedAt === 'string' ? row.publishedAt : '',
        source: { name: typeof source.name === 'string' ? source.name : '' } }];
    }));
  };

  const results = [marketsResult, techResult, geoResult];
  if (results.every(result => result.status === 'rejected')) return unavailable();
  return NextResponse.json({
    markets: extract(marketsResult),
    tech: extract(techResult),
    geopolitics: extract(geoResult),
  }, { headers: results.some(result => result.status === 'rejected') ? { 'X-News-Data-Partial': 'true', 'Cache-Control': 'no-store' } : {} });
}

function unavailable() {
  return NextResponse.json({ markets: [], tech: [], geopolitics: [], status: 'error', message: 'News is temporarily unavailable. Please try again.' }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' } });
}
