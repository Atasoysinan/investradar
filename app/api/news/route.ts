import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category') || 'business';
  const country = searchParams.get('country') || 'us';
  const q = searchParams.get('q') || '';

  const apiKey = process.env.NEWSAPI_KEY;

  const regionKeywords: Record<string, string> = {
    gb: 'UK business economy finance',
    de: 'Germany business economy finance',
    fr: 'France business economy finance',
    jp: 'Japan business economy finance',
    cn: 'China business economy finance',
    au: 'Australia business economy finance',
  };

  let url = '';
  if (q) {
    url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=publishedAt&pageSize=30&apiKey=${apiKey}`;
  } else if (country !== 'us' && regionKeywords[country]) {
    const regionQ = encodeURIComponent(regionKeywords[country]);
    url = `https://newsapi.org/v2/everything?q=${regionQ}&sortBy=publishedAt&pageSize=30&apiKey=${apiKey}`;
  } else {
    url = `https://newsapi.org/v2/top-headlines?category=${category}&country=${country}&pageSize=30&apiKey=${apiKey}`;
  }

  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch news' }, { status: 500 });
  }
}
