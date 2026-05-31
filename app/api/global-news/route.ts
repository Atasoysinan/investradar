import { NextResponse } from 'next/server';

export async function GET() {
    const KEY = process.env.GNEWS_KEY;
    if (!KEY) return NextResponse.json({ error: 'API key not configured' }, { status: 500 });

  try {
        const url = `https://gnews.io/api/v4/top-headlines?topic=business&lang=en&max=9&apikey=${KEY}`;
        const res = await fetch(url, { next: { revalidate: 1800 } });
        const data = await res.json();

      if (!res.ok || data.errors) {
              return NextResponse.json({ articles: [] });
      }

      const articles = (data.articles || []).map((a: {
              title: string;
              description: string;
              url: string;
              image: string;
              publishedAt: string;
              source: { name: string; url: string };
      }) => ({
              title: a.title,
              description: a.description,
              url: a.url,
              urlToImage: a.image,
              publishedAt: a.publishedAt,
              source: { name: a.source?.name || '' },
      }));

      return NextResponse.json({ articles });
  } catch {
        return NextResponse.json({ articles: [] });
  }
}
