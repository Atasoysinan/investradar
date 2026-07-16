'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import StockPills from '@/components/StockPills';
import NewsletterSignup from '@/components/NewsletterSignup';
import Header from '@/components/Header';
import MarketBuzz from '@/components/MarketBuzz';
import MarketChatter from '@/components/MarketChatter';

interface Article {
  title: string;
  description: string;
  url: string;
  urlToImage: string;
  publishedAt: string;
  source: { name: string };
  author: string;
  isLive?: boolean;
}

interface SectorItem {
  ticker: string;
  sectorName: string;
  price: number;
  change: number;
  changePercent: number;
}

interface GlobalNews {
  americas: Article[];
  europe: Article[];
  asia: Article[];
}

interface TopicNews {
  markets: Article[];
  tech: Article[];
  geopolitics: Article[];
}

const CATEGORIES = [
  { label: 'Latest', value: 'latest', keywords: [] as string[] },
  { label: 'Markets', value: 'markets', keywords: ['market','stock','shares','equit','index','indices','bond','yield','wall street','nasdaq','dow','s&p','ftse','trading','trader','rally','sell-off','selloff','bull','bear'] },
  { label: 'Finance', value: 'finance', keywords: ['bank','finance','financial','loan','credit','fund','investor','investment','ipo','merger','acquisition','earnings','revenue','profit','dividend','hedge','private equity','venture','fintech','payment'] },
  { label: 'Economics', value: 'economics', keywords: ['economy','economic','inflation','gdp','recession','unemployment','jobs','labor','fed','federal reserve','central bank','interest rate','rate hike','rate cut','tariff','trade','fiscal','monetary','deficit','growth'] },
  { label: 'Industries', value: 'industries', keywords: ['industry','industrial','manufactur','energy','oil','gas','auto','airline','retail','pharma','mining','steel','aviation','shipping','logistics','construction','agricultur','commodit','factory','supply chain'] },
  { label: 'Tech', value: 'tech', keywords: ['tech','technolog','ai','artificial intelligence','software','chip','semiconductor','apple','google','microsoft','amazon','meta','nvidia','startup','cloud','cyber','data','app','digital','internet','robot'] },
  { label: 'Politics', value: 'politics', keywords: ['politic','government','election','president','congress','senate','parliament','policy','regulation','war','sanction','geopolit','diplomat','minister','netanyahu','trump','biden','china','russia','ukraine','israel','defense','military'] },
];

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function sourceLabelClass(name: string = '') {
  const n = name.toLowerCase();
  if (n.includes('bloomberg') || n.includes('reuters')) return 'bg-red-600 text-white';
  if (n.includes('yahoo') || n.includes('cnbc')) return 'bg-blue-600 text-white';
  return 'bg-gray-700 text-white';
}

const DEFAULT_FALLBACK = 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1600&q=90';

const TOPIC_FALLBACKS: { keys: string[]; image: string }[] = [
  { keys: ['crypto', 'bitcoin', 'ethereum', 'blockchain'], image: 'https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=1600&q=90' },
  { keys: ['oil', 'energy', 'gas', 'opec', 'commodit'], image: 'https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?w=1600&q=90' },
  { keys: ['fed', 'interest rate', 'central bank', 'inflation', 'ecb'], image: 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=1600&q=90' },
  { keys: ['war', 'sanction', 'election', 'military', 'geopolit', 'conflict'], image: 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=1600&q=90' },
  { keys: ['artificial intelligence', 'semiconductor', 'chip', 'software', 'tech'], image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1600&q=90' },
  { keys: ['health', 'medicine', 'drug', 'vaccine', 'disease'], image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1600&q=90' },
  { keys: ['science', 'research', 'space', 'climate'], image: 'https://images.unsplash.com/photo-1564325724739-bae0bd08762c?w=1600&q=90' },
  { keys: ['stock', 'market', 'shares', 'nasdaq', 'earnings', 'trading'], image: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1600&q=90' },
];

function upgradeImageQuality(u: string): string {
  try {
    const url = new URL(u);
    const h = url.hostname;
    const sp = url.searchParams;
    if (h.includes('unsplash.com')) {
      if (sp.has('w')) sp.set('w', '1600');
      if (sp.has('q')) sp.set('q', '90');
    } else if (h.includes('insider.com') || h.includes('infomaker.io')) {
      if (sp.has('width')) sp.set('width', '1600');
      if (sp.has('q')) sp.set('q', '90');
    }
    return url.toString();
  } catch {
    return u;
  }
}

function getArticleImage(article: { urlToImage?: string | null; image?: string | null; title?: string; description?: string }): string {
  if (article.urlToImage) return upgradeImageQuality(article.urlToImage);
  if (article.image) return upgradeImageQuality(article.image);
  const text = ((article.title || '') + ' ' + (article.description || '')).toLowerCase();
  for (const topic of TOPIC_FALLBACKS) {
    if (topic.keys.some(k => text.includes(k))) return upgradeImageQuality(topic.image);
  }
  return upgradeImageQuality(DEFAULT_FALLBACK);
}

function decodeHtml(str: string): string {
  return str
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <div className="border-b border-gray-200 pb-3 mb-6">
    <h2 className="text-xs font-bold text-gray-900 uppercase tracking-widest">{children}</h2>
  </div>
);

export default function Home() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [region] = useState('us');
  const [category, setCategory] = useState('latest');
  const [searchQuery, setSearchQuery] = useState('');
  const [headerVisible, setHeaderVisible] = useState(true); const lastScrollY = useRef(0); useEffect(() => { const handleScroll = () => { const y = window.scrollY; setHeaderVisible(y < lastScrollY.current || y < 80); lastScrollY.current = y; }; window.addEventListener('scroll', handleScroll, { passive: true }); return () => window.removeEventListener('scroll', handleScroll); }, []);

  const [sectorData, setSectorData] = useState<SectorItem[]>([]);
  const [sectorLoading, setSectorLoading] = useState(true);
  const [globalNews, setGlobalNews] = useState<GlobalNews | null>(null);
  const [globalNewsLoading, setGlobalNewsLoading] = useState(true);
  const [topicNews, setTopicNews] = useState<TopicNews | null>(null);
  const [briefs, setBriefs] = useState<{ headline: string; summary: string; sources: { name: string; url: string }[] }[]>([]);
  const [topicNewsLoading, setTopicNewsLoading] = useState(true);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let url = '/api/news?';
      if (searchQuery) {
        url += `q=${encodeURIComponent(searchQuery)}`;
      } else {
        url += `region=${region}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === 'error') throw new Error(data.message);
      setArticles(data.articles?.filter((a: Article) => a.title !== '[Removed]') || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load news');
    } finally {
      setLoading(false);
    }
  }, [region, searchQuery]);

  useEffect(() => {
    fetchNews();
    const id = setInterval(fetchNews, 300000);
    return () => clearInterval(id);
  }, [fetchNews]);

  useEffect(() => {
    Promise.allSettled([
      fetch('/api/sectors').then(r => r.json()),
      fetch('/api/global-news').then(r => r.json()),
      fetch('/api/topic-news').then(r => r.json()),
      fetch('/api/briefs').then(r => r.json()),
    ]).then(([sResult, gResult, tResult, bResult]) => {
      if (sResult.status === 'fulfilled' && Array.isArray(sResult.value)) {
        setSectorData(sResult.value as SectorItem[]);
      }
      if (gResult.status === 'fulfilled') setGlobalNews(gResult.value as GlobalNews);
      if (tResult.status === 'fulfilled') setTopicNews(tResult.value as TopicNews);
      if (bResult.status === 'fulfilled' && Array.isArray((bResult.value as { briefs?: unknown[] }).briefs)) setBriefs((bResult.value as { briefs: { headline: string; summary: string; sources: { name: string; url: string }[] }[] }).briefs);
      setSectorLoading(false);
      setGlobalNewsLoading(false);
      setTopicNewsLoading(false);
    });
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchNews();
  };

  const activeCat = CATEGORIES.find(c => c.value === category) || CATEGORIES[0];
  const matchesCat = (a: Article) => {
    if (activeCat.keywords.length === 0) return true;
    const hay = ((a.title || '') + ' ' + (a.description || '')).toLowerCase();
    return activeCat.keywords.some(k => hay.includes(k));
  };
  const catFiltered = articles.filter(matchesCat);
  const displayArticles = catFiltered.length >= 4 ? catFiltered : articles;
  const imageScore = (a: Article): number => {
    const img = a.urlToImage;
    if (!img) return 0;
    if (/guim\.co\.uk/i.test(img)) return 1;
    if (/\/\d{2,3}x\d{2,3}\//.test(img) || /[?&](?:w|width)=\d{2,3}(?:&|$)/i.test(img)) return 1;
    return 2;
  };
  const ordered = [...displayArticles].sort((a: Article, b: Article) => imageScore(b) - imageScore(a));
  const hero = ordered[0]; const featured = ordered.slice(1, 4); const compact = ordered.slice(4);

  const filterPill = (active: boolean) =>
    `relative pb-2 text-sm tracking-wide transition-colors border-b-2 -mb-px ${
      active
        ? 'text-gray-900 font-semibold border-gray-900'
        : 'text-gray-500 font-medium border-transparent hover:text-gray-900'
    }`;

  return (
    <div className="min-h-screen bg-[#f5f6f7] text-gray-900">
      <header className={`bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm transition-transform duration-300 ${headerVisible ? 'translate-y-0' : '-translate-y-full'}`}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-sm text-white">IR</div>
            <span className="text-xl font-bold text-gray-900">InvestRadar</span>
            <span className="text-xs text-gray-400 hidden sm:block">Financial & Geopolitical Intelligence</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/markets" className="text-sm text-gray-600 hover:text-gray-900 transition-colors font-medium hidden sm:block">
              Markets
            </Link>
            <Link href="/videos" className="text-sm text-gray-600 hover:text-gray-900 transition-colors font-medium hidden sm:block">
              Videos
            </Link>
            <form onSubmit={handleSearch} className="hidden sm:flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search markets, companies, topics..."
                className="bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 text-sm w-48 sm:w-64 focus:outline-none focus:border-blue-500 text-gray-900 placeholder-gray-400"
              />
              <button type="submit" className="bg-gray-900 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                Search
              </button>
            </form>
            <Header />
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Category */}
        <div className="mb-6">
          <div>
            <div className="flex flex-wrap items-center gap-6 border-b border-gray-200">
              {CATEGORIES.map(c => (
                <button
                  key={c.value}
                  onClick={() => { setCategory(c.value); setSearchQuery(''); }}
                  className={filterPill(category === c.value && !searchQuery)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0 w-full max-w-full">

        {/* Status bar */}
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm text-gray-500 font-medium">
            {loading ? 'Loading...' : error ? '' : ''}
            {searchQuery && !loading && (
              <span className="ml-2 text-blue-600">· Search results</span>
            )}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700 text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 h-80 animate-pulse" />
            <div className="grid grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-100 animate-pulse">
                  <div className="h-44 bg-gray-100 rounded-t-lg" />
                  <div className="p-4 space-y-2">
                    <div className="h-3 bg-gray-100 rounded w-1/3" />
                    <div className="h-4 bg-gray-100 rounded w-full" />
                    <div className="h-4 bg-gray-100 rounded w-4/5" />
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 divide-y divide-gray-100">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3 animate-pulse">
                  <div className="space-y-2 flex-1">
                    <div className="h-3 bg-gray-100 rounded w-1/4" />
                    <div className="h-4 bg-gray-100 rounded w-3/4" />
                  </div>
                  <div className="h-3 bg-gray-100 rounded w-16 ml-4" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Today's Briefs (AI single-pass synthesis) */}
        {briefs.length > 0 && (
          <div className="mb-6 border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-gray-900 text-white text-[11px] uppercase tracking-widest font-semibold flex items-center gap-2">
              <span>The Brief</span>
              <span className="text-gray-400 normal-case tracking-normal font-normal">· today&apos;s essentials</span>
            </div>
            <ol className="divide-y divide-gray-100">
              {briefs.map((b, i) => (
                <li key={i} className="px-4 py-2.5 flex gap-3 hover:bg-gray-50 transition-colors">
                  <span className="text-xs font-bold text-gray-300 pt-0.5 w-4 flex-shrink-0">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 leading-snug">{b.headline}</p>
                    <p className="text-xs text-gray-500 leading-snug mt-0.5">{b.summary}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2">
                      {b.sources.map((s2, j) => (
                        <a
                          key={j}
                          href={s2.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-medium text-blue-600 hover:underline"
                        >
                          {s2.name}
                        </a>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Articles */}
        {!loading && !error && articles.length > 0 && (
          <div className="space-y-6">
            {/* Hero */}
            {hero && (
              <a
                href={hero.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col sm:flex-row bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow group"
              >
                <div className="w-full sm:w-3/5 flex-shrink-0 h-56 sm:h-80">
                  <img
                    src={getArticleImage(hero)}
                    alt={decodeHtml(hero.title)}
                    className="w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).src = DEFAULT_FALLBACK; }}
                  />
                </div>
                <div className="flex flex-col justify-center p-6 sm:p-8 flex-1">
                  <span className="self-start mb-3 flex items-center gap-1">
                    <span className={`max-w-[120px] truncate text-xs font-bold uppercase px-2 py-0.5 rounded ${sourceLabelClass(hero.source?.name)}`}>
                      {hero.source?.name || 'Unknown'}
                    </span>
                    {hero.isLive && <span className="text-xs font-bold text-green-600">🟢 LIVE</span>}
                  </span>
                  <h1 className="text-2xl font-bold text-gray-900 leading-snug mb-3 group-hover:text-blue-700 transition-colors">
                    {decodeHtml(hero.title)}
                  </h1>
                  {hero.description && (
                    <p className="text-gray-600 text-sm leading-relaxed line-clamp-3 mb-4">
                      {decodeHtml(hero.description)}
                    </p>
                  )}
                  <StockPills headline={hero.title} description={hero.description || ''} />
                  <span className="text-xs text-gray-400 mt-2">{timeAgo(hero.publishedAt)}</span>
                </div>
              </a>
            )}

            {/* Featured 3-column */}
            {featured.length > 0 && (
              <div className="flex md:grid overflow-x-auto md:overflow-visible snap-x snap-mandatory max-w-full gap-4 md:grid-cols-3 -mx-4 px-4 md:mx-0 md:px-0 pb-2">
                {featured.map((article, i) => (
                  <a
                    key={i}
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 w-[85%] sm:w-[60%] md:w-auto snap-start bg-white border border-gray-100 rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow group flex flex-col"
                  >
                    <div className="overflow-hidden bg-gray-100" style={{ height: '180px' }}>
                      <img
                        src={getArticleImage(article)}
                        alt={decodeHtml(article.title)}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={e => { (e.target as HTMLImageElement).src = DEFAULT_FALLBACK; }}
                      />
                    </div>
                    <div className="p-4 flex flex-col flex-1">
                      <span className="flex items-center gap-1 mb-2">
                        <span className="text-xs font-semibold text-red-600 uppercase tracking-wide">
                          {article.source?.name || 'Unknown'}
                        </span>
                        {article.isLive && <span className="text-xs font-bold text-green-600">🟢 LIVE</span>}
                      </span>
                      <h2 className="font-semibold text-gray-900 text-base leading-snug group-hover:text-blue-700 transition-colors line-clamp-3">
                        {decodeHtml(article.title)}
                      </h2>
                      <StockPills headline={article.title} description={article.description || ''} />
                      <span className="text-xs text-gray-400 mt-auto pt-2">{timeAgo(article.publishedAt)}</span>
                    </div>
                  </a>
                ))}
              </div>
            )}

            {/* Compact list */}
            {compact.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm divide-y divide-gray-100">
                {compact.map((article, i) => (
                  <div
                    key={i}
                    onClick={() => window.open(article.url, '_blank')}
                    className="flex items-center justify-between py-3 px-4 hover:bg-gray-50 transition-colors group cursor-pointer"
                  >
                    <div className="flex flex-col flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <span className={`flex-shrink-0 max-w-[120px] truncate text-xs font-bold uppercase px-2 py-0.5 rounded ${sourceLabelClass(article.source?.name)}`}>
                          {article.source?.name || 'Unknown'}
                        </span>
                        {article.isLive && <span className="flex-shrink-0 text-xs font-bold text-green-600">🟢 LIVE</span>}
                        <span className="font-medium text-gray-900 text-sm line-clamp-1 group-hover:text-blue-700 transition-colors">
                          {decodeHtml(article.title)}
                        </span>
                      </div>
                      <StockPills headline={article.title} description={article.description || ''} />
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0 ml-4 self-start pt-0.5">{timeAgo(article.publishedAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!loading && !error && articles.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            No articles found. Try a different category.
          </div>
        )}

        </div>{/* end left column */}
        <div className="w-full lg:w-72 flex-shrink-0">
          <MarketBuzz />
        </div>
        </div>{/* end flex row */}
      </div>

      {/* ── Below-the-fold enrichment sections ── */}
      <div className="max-w-6xl mx-auto px-4 pb-16 space-y-14 mt-6 border-t border-gray-200 pt-10">

        {/* Global Economy */}
        <section>
          {globalNewsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="space-y-4">
                  {[...Array(3)].map((_, j) => (
                    <div key={j} className="animate-pulse">
                      <div className="h-28 bg-gray-100 rounded mb-2" />
                      <div className="h-3 bg-gray-100 rounded w-1/3 mb-1" />
                      <div className="h-4 bg-gray-100 rounded w-full mb-1" />
                      <div className="h-4 bg-gray-100 rounded w-3/4" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : globalNews ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {([
                { label: '🌎 Americas', articles: globalNews.americas },
                { label: '🇪🇺 Europe',   articles: globalNews.europe },
                { label: '🌏 Asia Pacific', articles: globalNews.asia },
              ] as { label: string; articles: Article[] }[]).map(col => (
                <div key={col.label}>
                  <div className="space-y-5">
                    {col.articles.map((a, i) => (
                      <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="flex gap-3 group items-start">
                        {a.urlToImage ? (
                          <div className="flex-shrink-0 w-20 h-20 bg-gray-100 rounded overflow-hidden">
                            <img
                              src={upgradeImageQuality(a.urlToImage)}
                              alt=""
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              onError={e => { const p = (e.target as HTMLImageElement).parentElement; if (p) p.style.display = 'none'; }}
                            />
                          </div>
                        ) : null}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">{a.source?.name}</p>
                          <p className="text-sm font-medium text-gray-900 leading-snug group-hover:text-black">{decodeHtml(a.title)}</p>
                          <p className="text-xs text-gray-400 mt-1">{timeAgo(a.publishedAt)}</p>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {/* Sector Performance */}
        <section>
          <SectionHeader>📊 Sector Performance</SectionHeader>
          {sectorLoading ? (
            <div className="flex gap-4 overflow-x-auto pb-3">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="min-w-[160px] flex-shrink-0 bg-white border border-gray-200 rounded-lg p-4 animate-pulse">
                  <div className="h-3 bg-gray-100 rounded mb-2 w-3/4" />
                  <div className="h-2 bg-gray-50 rounded mb-3 w-1/2" />
                  <div className="h-5 bg-gray-100 rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : sectorData.length > 0 ? (
            <div className="flex overflow-x-auto gap-4 pb-3">
              {sectorData.map(s => (
                <div
                  key={s.ticker}
                  className={`min-w-[160px] flex-shrink-0 bg-white rounded-lg p-4 border ${
                    s.changePercent >= 0
                      ? 'border-green-200 border-l-4 border-l-green-500 bg-green-50'
                      : 'border-red-200 border-l-4 border-l-red-400 bg-red-50'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-xs font-bold text-gray-800 uppercase tracking-wide leading-tight">{s.sectorName}</p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">{s.ticker}</p>
                    </div>
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                      s.changePercent >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                    }`}>{s.changePercent >= 0 ? '▲' : '▼'}</span>
                  </div>
                  <div className="flex items-end justify-between">
                    <p className="text-sm font-semibold text-gray-700">${s.price.toFixed(2)}</p>
                    <p className={`text-base font-bold ${s.changePercent >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {Math.abs(s.changePercent).toFixed(2)}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {/* Market Videos */}
        <section>
          <SectionHeader>🎬 Market Videos</SectionHeader>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { name: 'CNBC', url: 'https://www.youtube.com/@CNBC', color: '#CC0000', desc: 'Breaking business news' },
              { name: 'Bloomberg', url: 'https://www.youtube.com/@Bloomberg', color: '#1464F4', desc: 'Global finance & markets' },
              { name: 'Yahoo Finance', url: 'https://www.youtube.com/@YahooFinance', color: '#6001D2', desc: 'Market data & earnings' },
              { name: 'The Economist', url: 'https://www.youtube.com/@TheEconomist', color: '#E3120B', desc: 'Global economic insight' },
              { name: 'WSJ', url: 'https://www.youtube.com/@wsj', color: '#0274B6', desc: 'Business & financial news' },
              { name: 'Investopedia', url: 'https://www.youtube.com/@Investopedia', color: '#1B5E20', desc: 'Investing education' },
            ].map((ch) => (
              <a
                key={ch.name}
                href={ch.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-100 hover:border-gray-300 hover:shadow-md transition-all duration-200 text-center"
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm"
                  style={{ backgroundColor: ch.color }}
                >
                  {ch.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}
                </div>
                <span className="text-xs font-semibold text-gray-800 leading-tight">{ch.name}</span>
                <span className="text-xs text-gray-400 leading-tight hidden md:block">{ch.desc}</span>
              </a>
            ))}
          </div>
        </section>

      </div>

      <section className="max-w-7xl mx-auto px-4 py-10 border-t border-gray-100">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">
              💬 Social Pulse
            </h2>
            <p className="text-xs text-gray-400">Real-time market sentiment from Stocktwits</p>
          </div>
          <a href="https://stocktwits.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-black border border-gray-200 rounded-full px-3 py-1.5 hover:border-gray-400 transition-colors">
            <span>View on Stocktwits</span>
            <span>→</span>
          </a>
        </div>
        <MarketChatter />
      </section>

      <div className="max-w-6xl mx-auto px-4 pb-12">
        <NewsletterSignup />
      </div>

      <footer className="border-t border-gray-200 py-6 text-center text-xs text-gray-400">
        © 2026 InvestRadar · Financial &amp; Geopolitical Intelligence
      </footer>
    </div>
  );
}
