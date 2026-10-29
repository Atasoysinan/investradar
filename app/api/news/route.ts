import { newsArticles } from '@/lib/newsProvider';
import { checkDataRateLimit } from '@/lib/dataRateLimit';
import { NextRequest, NextResponse } from 'next/server';
import { decodeHtml } from '@/lib/decodeHtml';

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
  { url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', name: 'MarketWatch' },
  { url: 'https://finance.yahoo.com/news/rssindex', name: 'Yahoo Finance' },
  { url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258', name: 'CNBC Markets' },
  { url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664', name: 'CNBC Finance' },
  { url: 'https://www.wired.com/feed/rss', name: 'Wired' },
  { url: 'https://techcrunch.com/feed/', name: 'TechCrunch' },
  { url: 'https://www.theverge.com/rss/index.xml', name: 'The Verge' },
  { url: 'https://feeds.arstechnica.com/arstechnica/index', name: 'Ars Technica' },
  { url: 'https://www.utilitydive.com/feeds/news/', name: 'Utility Dive' },
  { url: 'https://www.supplychaindive.com/feeds/news/', name: 'Supply Chain Dive' },
  { url: 'https://oilprice.com/rss/main', name: 'OilPrice' },
  { url: 'https://feeds.bbci.co.uk/news/politics/rss.xml', name: 'BBC Politics' },
  { url: 'https://thehill.com/news/feed/', name: 'The Hill' },
  { url: 'https://rss.politico.com/politics-news.xml', name: 'Politico' },
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
  const age = Date.now() - Date.parse(publishedAt);
  return Number.isFinite(age) && age >= 0 && age < 60 * 60 * 1000;
}

function stripCDATA(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function decodeEntities(u: string | null): string | null {
  if (!u) return u;
  return u.replace(/&amp;/g, '&').replace(/&#38;/g, '&');
}

function stripHTML(s: string): string {
  return decodeHtml(s).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function parsePubDate(s: string): string {
  try {
    const d = new Date(s);
    return Number.isFinite(d.getTime()) ? d.toISOString() : '';
  } catch { return ''; }
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

const SOURCE_TIMEOUT_MS = 5000;

class NewsSourceTimeoutError extends Error {}

// Only known public codes may enter logs; provider text can echo credentials.
const SAFE_PROVIDER_CODES = new Set([
  'Unauthorized', 'RateLimitExceeded', 'TooManyRequests',
  'invalid_access_key', 'missing_access_key', 'usage_limit_reached',
  'rate_limit_reached', 'function_access_restricted', 'https_access_restricted',
  'ip_restricted', 'internal_error',
]);

async function fetchSource<T>(
  url: string,
  options: RequestInit & { next: { revalidate: number } },
  read: (response: Response) => Promise<T>,
  acceptHttpErrors = false,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new NewsSourceTimeoutError('News source timed out'));
      controller.abort();
    }, SOURCE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      deadline,
      (async () => {
        const response = await fetch(url, { ...options, signal: controller.signal });
        if (!response.ok && !acceptHttpErrors) throw new Error('News source unavailable');
        return read(response);
      })(),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchProvider(url: string, field: string, sourceName: string, revalidate: number): Promise<Article[]> {
  let httpStatus: number | null = null;
  let providerCode: string | null = null;
  let failure = 'network_error';
  let items: Record<string, unknown>[];
  try {
    const payload: unknown = await fetchSource(url, { redirect: 'error', next: { revalidate } }, async response => {
      httpStatus = response.status;
      failure = response.ok ? 'invalid_response' : 'http_error';
      const data: unknown = await response.json();
      const body = record(data);
      const code = record(body.error).code ?? record(body.results).code;
      if (typeof code === 'string' && SAFE_PROVIDER_CODES.has(code)) providerCode = code;
      if (!response.ok) throw new Error('News source unavailable');
      return data;
    }, true);
    const body = record(payload);
    if (body.status === 'error' || body.success === false || body.error
      || (Array.isArray(body.errors) ? body.errors.length > 0 : Boolean(body.errors))) failure = 'provider_error';
    items = newsArticles(payload, field);
  } catch (error) {
    if (sourceName === 'NewsData' || sourceName === 'Mediastack') {
      console.warn('News provider request failed', {
        provider: sourceName,
        failure: error instanceof NewsSourceTimeoutError ? 'timeout' : failure,
        httpStatus,
        providerCode,
      });
    }
    throw new Error('News source unavailable');
  }
  return items.flatMap((item): Article[] => {
    const a = record(item);
    const title = text(a.title);
    const url = text(a.url) || text(a.link);
    if (!title || title === '[Removed]' || !url) return [];
    const publishedAt = parsePubDate(text(a.publishedAt) || text(a.pubDate) || text(a.published_at));
    return [{
      title: stripHTML(title), description: stripHTML(text(a.description)), url,
      urlToImage: text(a.urlToImage) || text(a.image) || text(a.image_url) || null,
      publishedAt, source: { name: text(record(a.source).name) || text(a.source) || text(a.source_id) || sourceName },
      isLive: checkIsLive(publishedAt),
      ...(sourceName === 'NewsData' || sourceName === 'Mediastack' ? { provider: 'api' } : {}),
    }];
  });
}

async function fetchRSS(feedUrl: string, sourceName: string): Promise<Article[]> {
  const text = await fetchSource(feedUrl, {
    headers: { 'User-Agent': 'InvestRadar/1.0' },
    next: { revalidate: 300 },
  }, response => response.text());
  const atom = /<(?:[\w.-]+:)?feed\b[^>]*\bxmlns(?::[\w.-]+)?\s*=\s*["']http:\/\/www\.w3\.org\/2005\/Atom["']/i.test(text)
    && /<\/(?:[\w.-]+:)?feed\s*>/i.test(text);
  if (!atom && (!/<(?:rss|rdf:RDF)(?:\s|>)/i.test(text) || !/<\/(?:rss|rdf:RDF)\s*>/i.test(text))) throw new Error('Invalid news feed');
  const items = text.match(atom ? /<(?:[\w.-]+:)?entry\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?entry\s*>/gi : /<item>([\s\S]*?)<\/item>/g) || [];
  const articles = items.slice(0, 10).flatMap((item): Article[] => {
    const element = (name: string) => item.match(new RegExp(`<(?:[\\w.-]+:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}\\s*>`, 'i'))?.[1] || '';
    const attribute = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'))?.[2] || '';
    const title = stripHTML(stripCDATA(element('title')));
    const atomLinks = atom ? item.match(/<(?:[\w.-]+:)?link\b[^>]*>/gi) || [] : [];
    const articleLink = atomLinks.find(tag => {
      const rel = attribute(tag, 'rel').toLowerCase();
      const type = attribute(tag, 'type').toLowerCase();
      return (!rel || rel === 'alternate') && (!type || type === 'text/html' || type === 'application/xhtml+xml');
    });
    const url = atom ? decodeHtml(attribute(articleLink || '', 'href')).trim()
      : stripCDATA(element('link') || element('guid')).trim();
    if (!title || !url || (atom && !/^https?:\/\//i.test(url))) return [];
    // Modification time is not publication time; missing dates stay unknown.
    const date = atom ? element('published') : element('pubDate');
    const publishedAt = date ? parsePubDate(stripCDATA(date)) : '';
    const content = atom ? element('summary') || element('content') : element('description');
    const description = stripHTML(stripCDATA(content)).slice(0, 200);
    const imgM = item.match(/<media:content[^>]+url=["']([^"']+)["']/i)
      || item.match(/<enclosure[^>]+url=["']([^"']+)["']/i)
      || item.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);
    const imageContent = decodeHtml(stripCDATA(atom ? element('content') : item));
    const urlToImage = decodeEntities(imgM ? imgM[1] : (imageContent.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || null);
    return [{ title, description, url, urlToImage, publishedAt, source: { name: sourceName }, isLive: checkIsLive(publishedAt) }];
  });
  const hasEntries = atom ? /<(?:[\w.-]+:)?entry\b/i.test(text) : /<item\b/i.test(text);
  if (hasEntries && articles.length === 0) throw new Error('Invalid news articles');
  return articles;
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

function isPromotion(article: Article): boolean {
  // Match shopping destinations, not generic financial words such as deal or coupon.
  try {
    const path = decodeURIComponent(new URL(article.url).pathname).toLowerCase();
    if (/\/(?:coupons?|coupon-codes?|promo-codes?|discount-codes?|voucher-codes?)(?:\/|$)/.test(path)
      || /(?:^|[/-])(?:coupon|promo|discount|voucher)-codes?\/?$/.test(path)
      || /\/shopping\/(?:deals?|offers?)(?:\/|$)/.test(path)) return true;
  } catch { /* An invalid URL is not evidence of promotional content. */ }
  const title = article.title;
  // Generic deals, offers and savings also describe mergers and company reporting.
  // Require coupon/code language or the format of an explicit shopping guide/CTA.
  const shopping = /\b(?:coupon|promo(?:tional)?|discount|voucher)\s+codes?\b|\bcoupons?\s*:|^best\b[^:]*\bdeals?\s*:|\bsale\s*:\s*(?:save\b|buy\s+one\b)/i.test(title);
  const savings = /\b\d+(?:\.\d+)?\s*%\s+off\b|[$£€]\s*\d+(?:\.\d+)?\s+off\b|\bsave\s+(?:up\s+to\s+)?(?:\d+(?:\.\d+)?\s*%|[$£€]\s*\d+)|\bbuy\s+one[,]?\s+get\s+one\b/i.test(title);
  return shopping && savings;
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const limited = await checkDataRateLimit(request, 'news', 1);
  if (limited) return limited;
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

  const results = await Promise.allSettled([
    // NewsAPI
    NEWSAPI_KEY ? fetchProvider(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(newsApiQuery)}&language=en&sortBy=publishedAt&pageSize=20&domains=${TRUSTED_DOMAINS}&apiKey=${NEWSAPI_KEY}`,
      'articles', 'NewsAPI', 300
    ) : Promise.reject('No NewsAPI key'),
    // GNews (skip if no key)
    GNEWS_KEY
      ? fetchProvider(`https://gnews.io/api/v4/top-headlines?${gNewsQS}`, 'articles', 'GNews', 300)
      : Promise.reject('No GNews key'),
    // NewsData.io (skip if no key)
    NEWSDATA_KEY ? fetchProvider(`https://newsdata.io/api/1/latest?apikey=${NEWSDATA_KEY}&language=en&category=business,politics,world${q ? '&q=' + encodeURIComponent(q) : ''}`, 'results', 'NewsData', 1800) : Promise.reject('No NewsData key'),
    // Mediastack (skip if no key)
    MEDIASTACK_KEY ? fetchProvider(`https://api.mediastack.com/v1/news?access_key=${encodeURIComponent(MEDIASTACK_KEY)}&languages=en&categories=business${q ? '&keywords=' + encodeURIComponent(q) : ''}&limit=25&sort=published_desc`, 'data', 'Mediastack', 1800) : Promise.reject('No Mediastack key'),
    // RSS feeds
    ...((region === 'europe' ? EU_FEEDS : region === 'asia' ? ASIA_FEEDS : region === 'france' ? FRANCE_FEEDS : region === 'uae' ? UAE_FEEDS : region === 'saudi' ? SAUDI_FEEDS : RSS_FEEDS).map(f => fetchRSS(f.url, f.name))),
  ]);

  if (results.every(result => result.status === 'rejected')) {
    return NextResponse.json({ status: 'error', articles: [], message: 'News is temporarily unavailable. Please try again.' }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' } });
  }
  const pool: Article[] = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);

  for (const a of pool) { if (a && a.title) a.title = stripHTML(a.title); }
  pool.sort((a, b) => {
    const aTime = Date.parse(a.publishedAt), bTime = Date.parse(b.publishedAt);
    if (!Number.isFinite(aTime)) return Number.isFinite(bTime) ? 1 : 0;
    if (!Number.isFinite(bTime)) return -1;
    return bTime - aTime;
  });
  const editorial = pool.filter(article => !isPromotion(article));
  const deduped = deduplicate(q ? editorial.filter((a) => ((a.title || '') + ' ' + (a.description || '')).toLowerCase().includes(q.toLowerCase())) : editorial);
  const apiSlots = deduped.filter(a => a.provider === 'api').slice(0, 2);
  const rest = deduped.filter(a => a.provider !== 'api');
  const articles = (() => { const out = rest.slice(); const positions = [3, 6]; apiSlots.forEach((it, k) => { const p = Math.min(positions[k] ?? out.length, out.length); out.splice(p, 0, it); }); return out.slice(0, 30); })();

  return NextResponse.json({ status: 'ok', articles }, { headers: results.some(result => result.status === 'rejected') ? { 'X-News-Data-Partial': 'true', 'Cache-Control': 'no-store' } : {} });
}
