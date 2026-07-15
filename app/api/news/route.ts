import { NextRequest, NextResponse } from 'next/server';

const NEWSAPI_KEY = process.env.NEWSAPI_KEY;
const GNEWS_KEY   = process.env.GNEWS_KEY; const NEWSDATA_KEY = process.env.NEWSDATA_KEY; const MEDIASTACK_KEY = process.env.MEDIASTACK_KEY;

const TRUSTED_DOMAINS = 'reuters.com,apnews.com,wsj.com,ft.com,cnbc.com,bloomberg.com,forbes.com,marketwatch.com,businessinsider.com,economist.com,bbc.co.uk,bbc.com,theguardian.com,nytimes.com,washingtonpost.com,politico.com,axios.com,thehill.com,investing.com,seekingalpha.com,benzinga.com,oilprice.com,techcrunch.com,arstechnica.com,wired.com,cnet.com,theverge.com';

const REGION_QUERIES: Record<string, string> = {
  us: 'United States business economy markets finance stocks Wall Street',
  europe: 'Europe European Union UK Germany France business economy markets finance ECB',
  asia: 'Asia China Japan India business economy markets finance stocks',
  france: 'France French economy business markets CAC40 Paris ECB euro',
  uae: 'UAE Dubai Abu Dhabi Gulf economy business markets DFM ADX',
  saudi: 'Saudi Arabia Riyadh Gulf economy business markets Tadawul Aramco',
};

const EU_FEEDS = [
  { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', name: 'BBC' },
  { url: 'https://feeds.skynews.com/feeds/rss/world.xml', name: 'Sky News' },
  { url: 'https://rss.dw.com/rdf/rss-en-bus', name: 'DW' },
  { url: 'https://www.france24.com/en/rss', name: 'France24' },
  { url: 'https://www.euronews.com/rss?level=theme&name=news', name: 'Euronews' },
];
const ASIA_FEEDS = [
  { url: 'https://asia.nikkei.com/rss/feed/nar', name: 'Nikkei Asia' },
  { url: 'https://timesofindia.indiatimes.com/rssfeeds/1898055.cms', name: 'Times of India' },
  { url: 'https://www.scmp.com/rss/92/feed', name: 'SCMP' },
  { url: 'https://www.thehindu.com/business/feeder/default.rss', name: 'The Hindu' },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml', name: 'Al Jazeera' },
  { url: 'https://www.japantimes.co.jp/feed/', name: 'Japan Times' },
  { url: 'https://www.smh.com.au/rss/business.xml', name: 'Sydney Morning Herald' },
];
const RSS_FEEDS = [
  { url: 'https://feeds.reuters.com/reuters/businessNews',               name: 'Reuters' },
  { url: 'https://feeds.apnews.com/rss/apf-finance',                    name: 'AP' },
  { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',       name: 'CNBC' },
  { url: 'https://www.theguardian.com/world/rss', name: 'The Guardian' },
  { url: 'https://feeds.a.dj.com/rss/RSSWorldNews.xml', name: 'WSJ World' },
];

const FRANCE_FEEDS = [
  { url: 'https://www.france24.com/en/rss', name: 'France 24' },
  { url: 'https://www.france24.com/en/business/rss', name: 'France 24 Business' },
  { url: 'https://www.france24.com/en/europe/rss', name: 'France 24 Europe' },
  { url: 'https://www.rfi.fr/en/france/rss', name: 'RFI' },
];
const UAE_FEEDS = [
  { url: 'https://www.thenationalnews.com/arc/outboundfeeds/rss/category/business/?outputType=xml', name: 'The National Business' },
  { url: 'https://www.thenationalnews.com/arc/outboundfeeds/rss/category/world/?outputType=xml', name: 'The National World' },
  { url: 'https://www.thenationalnews.com/arc/outboundfeeds/rss/category/business/economy/?outputType=xml', name: 'The National Economy' },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml', name: 'Al Jazeera' },
];
const SAUDI_FEEDS = [
  { url: 'https://www.arabnews.com/rss.xml', name: 'Arab News' },
  { url: 'https://www.arabnews.com/cat/1/rss.xml', name: 'Arab News Saudi' },
  { url: 'https://www.arabnews.com/cat/3/rss.xml', name: 'Arab News Business' },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml', name: 'Al Jazeera' },
];

interface Article {
  title: string;
  description: string;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  source: { name: string };
  isLive: boolean;
  provider?: string;
}

function checkIsLive(publishedAt: string): boolean {
  return (Date.now() - new Date(publishedAt).getTime()) < 60 * 60 * 1000;
}

function stripCDATA(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function decodeEntities(u: string | null): string | null {
  if (!u) return u;
  return u.replace(/&amp;/g, '&').replace(/&#38;/g, '&');
}

function stripHTML(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function parsePubDate(s: string): string {
  try {
    const d = new Date(s);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  } catch { return new Date().toISOString(); }
}

async function fetchRSS(feedUrl: string, sourceName: string): Promise<Article[]> {
  const res = await fetch(feedUrl, {
    headers: { 'User-Agent': 'InvestRadar/1.0' },
    next: { revalidate: 300 },
  });
  if (!res.ok) return [];
  const text = await res.text();
  const items = text.match(/<item>([\s\S]*?)<\/item>/g) || [];
  return items.slice(0, 10).flatMap((item): Article[] => {
    const titleM   = item.match(/<title>([\s\S]*?)<\/title>/);
    const linkM    = item.match(/<link>([\s\S]*?)<\/link>/)
                  || item.match(/<guid[^>]*>([\s\S]*?)<\/guid>/);
    const dateM    = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const descM    = item.match(/<description>([\s\S]*?)<\/description>/);
    const imgM     = item.match(/<media:content[^>]+url="([^"]+)"/i)
                  || item.match(/<enclosure[^>]+url="([^"]+)"/i)
                  || item.match(/<media:thumbnail[^>]+url="([^"]+)"/i);
    const title    = titleM  ? stripCDATA(titleM[1])  : '';
    const url      = linkM   ? stripCDATA(linkM[1]).trim() : '';
    if (!title || !url) return [];
    const publishedAt = dateM ? parsePubDate(stripCDATA(dateM[1])) : new Date().toISOString();
    const description = descM ? stripHTML(stripCDATA(descM[1])).slice(0, 200) : '';
    const urlToImage  = decodeEntities(imgM ? imgM[1] : (item.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || null);
    return [{ title, description, url, urlToImage, publishedAt, source: { name: sourceName }, isLive: checkIsLive(publishedAt) }];
  });
}

function sharesWords(t1: string, t2: string): boolean {
  const words = t1.toLowerCase().split(/\s+/);
  const target = t2.toLowerCase();
  for (let i = 0; i <= words.length - 6; i++) {
    if (target.includes(words.slice(i, i + 6).join(' '))) return true;
  }
  return false;
}

function deduplicate(articles: Article[]): Article[] {
  const out: Article[] = [];
  for (const a of articles) {
    if (!out.some(r => sharesWords(r.title, a.title) || sharesWords(a.title, r.title))) {
      out.push(a);
    }
  }
  return out;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const region = searchParams.get('region') || searchParams.get('country') || 'us';
  const q        = searchParams.get('q')         || '';

  // NewsAPI query
  const newsApiQuery = q ? q : (REGION_QUERIES[region] || REGION_QUERIES.us);

  // GNews params
  const gNewsCountry = region === 'europe' ? 'gb' : region === 'asia' ? 'jp' : 'us';
  const gNewsQS = q
    ? `q=${encodeURIComponent(q)}&lang=en&country=${gNewsCountry}&max=10&sortby=publishedAt&token=${GNEWS_KEY}`
    : `category=business&lang=en&country=${gNewsCountry}&max=10&sortby=publishedAt&token=${GNEWS_KEY}`;

  const [newsApiResult, gNewsResult, newsDataResult, mediastackResult, ...rssResults] = await Promise.allSettled([
    // NewsAPI
    fetch(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(newsApiQuery)}&language=en&sortBy=publishedAt&pageSize=20&domains=${TRUSTED_DOMAINS}&apiKey=${NEWSAPI_KEY}`,
      { next: { revalidate: 300 } }
    ).then(r => r.json()),
    // GNews (skip if no key)
    GNEWS_KEY
      ? fetch(`https://gnews.io/api/v4/top-headlines?${gNewsQS}`, { next: { revalidate: 300 } }).then(r => r.json())
      : Promise.reject('No GNews key'),
    // NewsData.io (skip if no key)
    NEWSDATA_KEY ? fetch(`https://newsdata.io/api/1/latest?apikey=${NEWSDATA_KEY}&language=en&category=business,politics,world${q ? '&q=' + encodeURIComponent(q) : ''}`, { next: { revalidate: 1800 } }).then((r) => r.json()) : Promise.reject('No NewsData key'),
    // Mediastack (skip if no key)
    MEDIASTACK_KEY ? fetch(`http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_KEY}&languages=en&categories=business${q ? '&keywords=' + encodeURIComponent(q) : ''}&limit=25&sort=published_desc`, { next: { revalidate: 1800 } }).then((r) => r.json()) : Promise.reject('No Mediastack key'),
    // RSS feeds
    ...((region === 'europe' ? EU_FEEDS : region === 'asia' ? ASIA_FEEDS : region === 'france' ? FRANCE_FEEDS : region === 'uae' ? UAE_FEEDS : region === 'saudi' ? SAUDI_FEEDS : RSS_FEEDS).map(f => fetchRSS(f.url, f.name).catch(() => [] as Article[]))),
  ]);

  const pool: Article[] = [];

  if (newsApiResult.status === 'fulfilled') {
    for (const a of newsApiResult.value.articles || []) {
      if (a.title === '[Removed]' || !a.title) continue;
      pool.push({ title: a.title, description: a.description || '', url: a.url, urlToImage: a.urlToImage || null, publishedAt: a.publishedAt, source: { name: a.source?.name || 'Unknown' }, isLive: checkIsLive(a.publishedAt) });
    }
  }

  if (gNewsResult.status === 'fulfilled') {
    for (const a of gNewsResult.value.articles || []) {
      if (!a.title) continue;
      pool.push({ title: a.title, description: a.description || '', url: a.url, urlToImage: a.image || null, publishedAt: a.publishedAt, source: { name: a.source?.name || 'GNews' }, isLive: checkIsLive(a.publishedAt) });
    }
  }

  if (newsDataResult.status === 'fulfilled') { for (const a of (newsDataResult.value.results || [])) { if (!a.title) continue; pool.push({ title: a.title, description: stripHTML(a.description || ''), url: a.link, urlToImage: a.image_url || null, publishedAt: parsePubDate(a.pubDate), source: { name: a.source_id || 'NewsData' }, isLive: checkIsLive(parsePubDate(a.pubDate)), provider: 'api' }); } }
  if (mediastackResult.status === 'fulfilled') { for (const a of (mediastackResult.value.data || [])) { if (!a.title) continue; pool.push({ title: a.title, description: stripHTML(a.description || ''), url: a.url, urlToImage: a.image || null, publishedAt: parsePubDate(a.published_at), source: { name: a.source || 'Mediastack' }, isLive: checkIsLive(parsePubDate(a.published_at)), provider: 'api' }); } }
  for (const r of rssResults) {
    if (r.status === 'fulfilled') pool.push(...(r.value as Article[]));
  }

  for (const a of pool) { if (a && a.title) a.title = stripHTML(a.title); }
  pool.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const deduped = deduplicate(q ? pool.filter((a) => ((a.title || '') + ' ' + (a.description || '')).toLowerCase().includes(q.toLowerCase())) : pool);
  const apiSlots = deduped.filter(a => a.provider === 'api').slice(0, 2);
  const rest = deduped.filter(a => a.provider !== 'api');
  const articles = (() => { const out = rest.slice(); const positions = [3, 6]; apiSlots.forEach((it, k) => { const p = Math.min(positions[k] ?? out.length, out.length); out.splice(p, 0, it); }); return out.slice(0, 30); })();

  return NextResponse.json({ status: 'ok', articles });
}
