import { newsArticles } from '@/lib/newsProvider';
import { createDataRequest } from '@/lib/dataRequest';
import { checkDataRateLimit } from '@/lib/dataRateLimit';
import { NextResponse } from 'next/server';

const NEWSAPI_KEY = process.env.NEWSAPI_KEY;
const GNEWS_KEY = process.env.GNEWS_KEY;

const TRUSTED_DOMAINS = 'reuters.com,apnews.com,wsj.com,ft.com,cnbc.com,bloomberg.com,forbes.com,marketwatch.com,businessinsider.com,bbc.co.uk,bbc.com,theguardian.com,nytimes.com,washingtonpost.com,axios.com,thehill.com,investing.com,seekingalpha.com,benzinga.com,techcrunch.com';

function timeAgoMinutes(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / 60000;
}

interface BreakingArticle {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  image: string | null;
  isBreaking: boolean;
}

interface GNewsArticle {
  title: string;
  url: string;
  publishedAt: string;
  source?: { name: string };
  image?: string;
}

interface NewsApiArticle {
  title: string;
  url: string;
  publishedAt: string;
  source?: { name: string };
  urlToImage?: string;
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const limited = await checkDataRateLimit(request, 'news', 1);
  if (limited) return limited;
  const read = createDataRequest();
  let articles: BreakingArticle[] = [];
  let healthySources = 0;
  let failedSources = 0;

  // SOURCE 1: GNews (near real-time)
  try {
    if (!GNEWS_KEY) throw new Error('News provider unavailable');
    const gUrl = `https://gnews.io/api/v4/top-headlines?q=breaking+OR+explosion+OR+crash+OR+emergency+OR+disaster+OR+attack&lang=en&country=us&max=5&sortby=publishedAt&token=${GNEWS_KEY}`;
    const gData = await read(gUrl, { next: { revalidate: 300 } });
    const rows = newsArticles(gData) as unknown as GNewsArticle[];
    healthySources++;
    const recent: GNewsArticle[] = rows.filter(
      (a: GNewsArticle) => timeAgoMinutes(a.publishedAt) < 360
    );
    if (recent.length > 0) {
      articles = recent.slice(0, 3).map((a: GNewsArticle) => ({
        title: a.title,
        url: a.url,
        source: a.source?.name || 'GNews',
        publishedAt: a.publishedAt,
        image: a.image || null,
        isBreaking: timeAgoMinutes(a.publishedAt) < 120,
      }));
    }
  } catch { failedSources++; }

  // SOURCE 2: NewsAPI fallback
  if (articles.length === 0) {
    try {
      if (!NEWSAPI_KEY) throw new Error('News provider unavailable');
      const nUrl = `https://newsapi.org/v2/everything?q=breaking+OR+explosion+OR+crash+OR+emergency+OR+disaster&domains=${TRUSTED_DOMAINS}&sortBy=publishedAt&pageSize=5&apiKey=${NEWSAPI_KEY}`;
      const nData = await read(nUrl, { next: { revalidate: 300 } });
      const rows = newsArticles(nData) as unknown as NewsApiArticle[];
      healthySources++;
      articles = rows.slice(0, 3).map((a: NewsApiArticle) => ({
        title: a.title,
        url: a.url,
        source: a.source?.name || 'NewsAPI',
        publishedAt: a.publishedAt,
        image: a.urlToImage || null,
        isBreaking: timeAgoMinutes(a.publishedAt) < 120,
      }));
    } catch { failedSources++; }
  }

  // Filter out sponsored/ad content
  articles = articles.filter(
    (a) => !/(sponsored|advertisement|partner content)/i.test(a.title)
  );

  if (healthySources === 0) return NextResponse.json({ articles: [], status: 'error', message: 'News is temporarily unavailable. Please try again.' }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' } });
  return NextResponse.json({ articles }, { headers: failedSources > 0 ? { 'X-News-Data-Partial': 'true', 'Cache-Control': 'no-store' } : {} });
}
