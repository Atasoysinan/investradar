import { newsArticles } from '@/lib/newsProvider';
import { fetchJson } from '@/lib/dataRequest';
import { checkDataRateLimit } from '@/lib/dataRateLimit';
import { NextResponse } from 'next/server';

// Search the subject of the article; GNews country filters publisher location.
const REGIONS = [
  { key: 'americas', query: '"United States" OR Canada OR Mexico OR Brazil OR Americas OR "Wall Street"' },
  { key: 'europe', query: 'Europe OR European OR Britain OR Germany OR France OR ECB' },
  { key: 'asia', query: 'Asia OR China OR Japan OR India OR Korea OR ASEAN' },
] as const;

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const limited = await checkDataRateLimit(request, 'news', 1);
  if (limited) return limited;
  const key = process.env.GNEWS_KEY;
  if (!key) return unavailable();

  const results = await Promise.allSettled(REGIONS.map(async region => {
    const query = `(${region.query}) AND (business OR economy OR markets OR finance)`;
    const params = new URLSearchParams({ q: query, in: 'title,description', lang: 'en', max: '3', sortby: 'publishedAt', apikey: key });
    const data = await fetchJson(`https://gnews.io/api/v4/search?${params}`, { next: { revalidate: 1800 } });
    return newsArticles(data).slice(0, 3).map(article => ({
      title: article.title as string,
      description: typeof article.description === 'string' ? article.description : '',
      url: (article.url || article.link) as string,
      urlToImage: typeof article.image === 'string' ? article.image : '',
      publishedAt: typeof article.publishedAt === 'string' ? article.publishedAt : '',
      source: { name: typeof article.source === 'object' && article.source && 'name' in article.source
        && typeof article.source.name === 'string' ? article.source.name : '' },
    }));
  }));

  if (results.every(result => result.status === 'rejected')) return unavailable();
  const body = Object.fromEntries(REGIONS.map((region, index) => {
    const result = results[index];
    return [region.key, result.status === 'fulfilled' ? result.value : []];
  }));
  return NextResponse.json(body, { headers: results.some(result => result.status === 'rejected')
    ? { 'X-News-Data-Partial': 'true', 'Cache-Control': 'no-store' } : {} });
}

function unavailable() {
  return NextResponse.json({ americas: [], europe: [], asia: [], status: 'error', message: 'News is temporarily unavailable. Please try again.' }, {
    status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' },
  });
}
