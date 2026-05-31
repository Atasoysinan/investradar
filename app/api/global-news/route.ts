import { NextResponse } from 'next/server';

interface Article {
      title: string;
      description: string;
      url: string;
      urlToImage: string;
      publishedAt: string;
      source: { name: string };
      content?: string;
      author?: string;
}

export async function GET() {
      const KEY = process.env.GNEWS_KEY;
      if (!KEY) return NextResponse.json({ americas: [], europe: [], asia: [] });

  try {
          const url = `https://gnews.io/api/v4/top-headlines?topic=business&lang=en&max=9&apikey=${KEY}`;
          const res = await fetch(url, { next: { revalidate: 1800 } });
          const data = await res.json();

        if (!res.ok || data.errors || !data.articles?.length) {
                  return NextResponse.json({ americas: [], europe: [], asia: [] });
        }

        const all: Article[] = (data.articles || []).map((a: {
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

        return NextResponse.json({
                  americas: all.slice(0, 3),
                  europe: all.slice(3, 6),
                  asia: all.slice(6, 9),
        });
  } catch {
          return NextResponse.json({ americas: [], europe: [], asia: [] });
  }
}
