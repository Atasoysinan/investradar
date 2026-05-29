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

interface NewsApiResponse {
  articles?: NewsArticle[];
}

export async function GET() {
  const KEY = process.env.NEWSAPI_KEY;
  if (!KEY) return NextResponse.json({ error: 'API key not configured' }, { status: 500 });

  const base = `https://newsapi.org/v2/everything?language=en&sortBy=publishedAt&domains=${DOMAINS}&apiKey=${KEY}`;

  const [americasResult, europeResult, asiaResult] = await Promise.allSettled([
    fetch(
      `${base}&q=${encodeURIComponent('economy OR markets OR fed OR inflation')}&pageSize=3`,
      { next: { revalidate: 1800 } }
    ).then(r => r.json() as Promise<NewsApiResponse>),
    fetch(
      `${base}&q=${encodeURIComponent('europe economy OR ECB OR eurozone OR UK economy')}&pageSize=3`,
      { next: { revalidate: 1800 } }
    ).then(r => r.json() as Promise<NewsApiResponse>),
    fetch(
      `${base}&q=${encodeURIComponent('china economy OR japan economy OR asia markets OR RBA')}&pageSize=3`,
      { next: { revalidate: 1800 } }
    ).then(r => r.json() as Promise<NewsApiResponse>),
  ]);

  const extract = (result: PromiseSettledResult<NewsApiResponse>): NewsArticle[] => {
    if (result.status !== 'fulfilled') return [];
    return (result.value.articles || [])
      .filter(a => a.title !== '[Removed]')
      .slice(0, 3);
  };

  return NextResponse.json({
    americas: extract(americasResult),
    europe: extract(europeResult),
    asia: extract(asiaResult),
  });
}
