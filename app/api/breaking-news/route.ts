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

export async function GET() {
  let articles: BreakingArticle[] = [];

  // SOURCE 1: GNews (near real-time)
  try {
    const gUrl = `https://gnews.io/api/v4/top-headlines?q=breaking+OR+explosion+OR+crash+OR+emergency+OR+disaster+OR+attack&lang=en&country=us&max=5&sortby=publishedAt&token=${GNEWS_KEY}`;
    const gRes = await fetch(gUrl, { next: { revalidate: 300 } });
    if (gRes.ok) {
      const gData = await gRes.json();
      const recent: GNewsArticle[] = (gData.articles || []).filter(
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
    }
  } catch { /* fall through to NewsAPI */ }

  // SOURCE 2: NewsAPI fallback
  if (articles.length === 0) {
    try {
      const nUrl = `https://newsapi.org/v2/everything?q=breaking+OR+explosion+OR+crash+OR+emergency+OR+disaster&domains=${TRUSTED_DOMAINS}&sortBy=publishedAt&pageSize=5&apiKey=${NEWSAPI_KEY}`;
      const nRes = await fetch(nUrl, { next: { revalidate: 300 } });
      if (nRes.ok) {
        const nData = await nRes.json();
        articles = (nData.articles || []).slice(0, 3).map((a: NewsApiArticle) => ({
          title: a.title,
          url: a.url,
          source: a.source?.name || 'NewsAPI',
          publishedAt: a.publishedAt,
          image: a.urlToImage || null,
          isBreaking: timeAgoMinutes(a.publishedAt) < 120,
        }));
      }
    } catch { /* return empty */ }
  }

  // Filter out sponsored/ad content
  articles = articles.filter(
    (a) => !/(sponsored|advertisement|partner content)/i.test(a.title)
  );

  return NextResponse.json({ articles });
}
