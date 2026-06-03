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

  const [marketsResult, techResult, geoResult] = await Promise.allSettled([
    fetch(
      `${base}&q=${encodeURIComponent('stock market OR earnings OR fed reserve OR interest rates')}&pageSize=4`,
      { next: { revalidate: 1800 } }
    ).then(r => r.json() as Promise<NewsApiResponse>),
    fetch(
      `${base}&q=${encodeURIComponent('artificial intelligence OR tech stocks OR semiconductor OR OpenAI OR NVIDIA')}&pageSize=4`,
      { next: { revalidate: 1800 } }
    ).then(r => r.json() as Promise<NewsApiResponse>),
    fetch(
      `${base}&q=${encodeURIComponent('geopolitics OR trade war OR sanctions OR global economy OR GDP')}&pageSize=4`,
      { next: { revalidate: 1800 } }
    ).then(r => r.json() as Promise<NewsApiResponse>),
  ]);

  const extract = (result: PromiseSettledResult<NewsApiResponse>): NewsArticle[] => {
    if (result.status !== 'fulfilled') return [];
    return (result.value.articles || [])
      .filter(a => a.title !== '[Removed]')
      .reduce((acc: typeof result.value.articles, a) => {
      const src = a.source?.name || '';
      if (!acc.find((x: typeof a) => x.source?.name === src) || acc.filter((x: typeof a) => x.source?.name === src).length < 1) {
        acc.push(a);
      }
      return acc;
    }, []).slice(0, 4);
  };

  return NextResponse.json({
    markets: extract(marketsResult),
    tech: extract(techResult),
    geopolitics: extract(geoResult),
  });
}
