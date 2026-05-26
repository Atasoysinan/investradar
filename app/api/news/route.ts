import { NextRequest, NextResponse } from 'next/server';

const TRUSTED_DOMAINS = 'reuters.com,apnews.com,wsj.com,ft.com,cnbc.com,bloomberg.com,forbes.com,marketwatch.com,businessinsider.com,economist.com,bbc.co.uk,bbc.com,theguardian.com,nytimes.com,washingtonpost.com,politico.com,axios.com,thehill.com,investing.com,seekingalpha.com,benzinga.com,oilprice.com,techcrunch.com,arstechnica.com,wired.com,cnet.com,theverge.com';

const CATEGORY_QUERIES: Record<string, string> = {
  business: 'business finance economy markets',
  technology: 'technology',
  general: 'politics news world',
  science: 'science',
  health: 'health medicine',
};

const REGION_QUERIES: Record<string, string> = {
  gb: 'UK business economy finance',
  de: 'Germany business economy finance',
  fr: 'France business economy finance',
  jp: 'Japan business economy finance',
  cn: 'China business economy finance',
  au: 'Australia business economy finance',
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category') || 'business';
  const country = searchParams.get('country') || 'us';
  const q = searchParams.get('q') || '';

  const apiKey = process.env.NEWSAPI_KEY;
  const domains = `&domains=${TRUSTED_DOMAINS}`;

  let query: string;
  if (q) {
    query = q;
  } else if (country !== 'us' && REGION_QUERIES[country]) {
    query = REGION_QUERIES[country];
  } else {
    query = CATEGORY_QUERIES[category] || 'business finance';
  }

  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=30${domains}&apiKey=${apiKey}`;

  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch news' }, { status: 500 });
  }
}
