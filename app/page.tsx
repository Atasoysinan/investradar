'use client';

import { useEffect, useState, useCallback } from 'react';
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
  { label: 'Business', value: 'business' },
  { label: 'Technology', value: 'technology' },
  { label: 'Politics', value: 'general' },
  { label: 'Science', value: 'science' },
  { label: 'Health', value: 'health' },
];

const REGIONS = [
  { label: '🇺🇸 USA', value: 'us' },
  { label: '🇬🇧 UK', value: 'gb' },
  { label: '🇩🇪 Germany', value: 'de' },
  { label: '🇫🇷 France', value: 'fr' },
  { label: '🇯🇵 Japan', value: 'jp' },
  { label: '🇨🇳 China', value: 'cn' },
  { label: '🇦🇺 Australia', value: 'au' },
];

const TOPICS = [
  { label: '📈 Markets', query: 'stock market investing' },
  { label: '🏦 Fed / ECB', query: 'federal reserve interest rates central bank' },
  { label: '⚡ Energy', query: 'oil energy commodities' },
  { label: '💻 Tech', query: 'technology AI semiconductor' },
  { label: '🌍 Geopolitics', query: 'war sanctions elections geopolitics' },
  { label: '₿ Crypto', query: 'bitcoin cryptocurrency' },
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

const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <div className="border-b border-gray-200 pb-3 mb-6">
    <h2 className="text-xs font-bold text-gray-900 uppercase tracking-widest">{children}</h2>
  </div>
);

export default function Home() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('business');
  const [country, setCountry] = useState('us');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMode, setActiveMode] = useState<'category' | 'topic'>('category');
  const [activeTopic, setActiveTopic] = useState('');

  const [sectorData, setSectorData] = useState<SectorItem[]>([]);
  const [sectorLoading, setSectorLoading] = useState(true);
  const [globalNews, setGlobalNews] = useState<GlobalNews | null>(null);
  const [globalNewsLoading, setGlobalNewsLoading] = useState(true);
  const [topicNews, setTopicNews] = useState<TopicNews | null>(null);
  const [topicNewsLoading, setTopicNewsLoading] = useState(true);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let url = '/api/news?';
      if (activeMode === 'topic' && activeTopic) {
        url += `q=${encodeURIComponent(activeTopic)}`;
      } else if (searchQuery) {
        url += `q=${encodeURIComponent(searchQuery)}`;
      } else {
        url += `category=${category}&country=${country}`;
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
  }, [category, country, searchQuery, activeMode, activeTopic]);

  useEffect(() => { fetchNews(); }, [fetchNews]);

  useEffect(() => {
    Promise.allSettled([
      fetch('/api/sectors').then(r => r.json()),
      fetch('/api/global-news').then(r => r.json()),
      fetch('/api/topic-news').then(r => r.json()),
    ]).then(([sResult, gResult, tResult]) => {
      if (sResult.status === 'fulfilled' && Array.isArray(sResult.value)) {
        setSectorData(sResult.value as SectorItem[]);
      }
      if (gResult.status === 'fulfilled') setGlobalNews(gResult.value as GlobalNews);
      if (tResult.status === 'fulfilled') setTopicNews(tResult.value as TopicNews);
      setSectorLoading(false);
      setGlobalNewsLoading(false);
      setTopicNewsLoading(false);
    });
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveMode('category');
    setActiveTopic('');
    fetchNews();
  };

  const handleTopicClick = (query: string) => {
    setActiveTopic(query);
    setActiveMode('topic');
    setSearchQuery('');
  };

  const hero = articles[0];
  const featured = articles.slice(1, 4);
  const compact = articles.slice(4);

  const filterPill = (active: boolean) =>
    `px-3 py-1 rounded text-sm font-medium transition-colors border ${
      active
        ? 'bg-gray-900 text-white border-gray-900'
        : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400 hover:text-gray-900'
    }`;

  return (
    <div className="min-h-screen bg-[#f5f6f7] text-gray-900">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
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
            <form onSubmit={handleSearch} className="flex gap-2">
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
        {/* Quick Topics */}
        <div className="mb-5">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-3 font-semibold">Quick Topics</p>
          <div className="flex flex-wrap gap-2">
            {TOPICS.map(t => (
              <button
                key={t.query}
                onClick={() => handleTopicClick(t.query)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                  activeTopic === t.query && activeMode === 'topic'
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400 hover:text-gray-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-6 mb-6 pb-6 border-b border-gray-200">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-2 font-semibold">Category</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(c => (
                <button
                  key={c.value}
                  onClick={() => { setCategory(c.value); setActiveMode('category'); setActiveTopic(''); setSearchQuery(''); }}
                  className={filterPill(category === c.value && activeMode === 'category')}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-2 font-semibold">Region</p>
            <div className="flex flex-wrap gap-2">
              {REGIONS.map(r => (
                <button
                  key={r.value}
                  onClick={() => { setCountry(r.value); setActiveMode('category'); setActiveTopic(''); setSearchQuery(''); }}
                  className={filterPill(country === r.value && activeMode === 'category')}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0">

        {/* Status bar */}
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm text-gray-500 font-medium">
            {loading ? 'Loading...' : error ? '' : `${articles.length} stories`}
            {activeMode === 'topic' && activeTopic && !loading && (
              <span className="ml-2 text-blue-600">· Topic search</span>
            )}
          </p>
          <button
            onClick={fetchNews}
            className="text-xs text-gray-600 border border-gray-300 bg-white hover:bg-gray-50 hover:border-gray-400 transition-colors px-3 py-1 rounded font-medium"
          >
            ↻ Refresh
          </button>
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

        {/* Articles */}
        {!loading && !error && articles.length > 0 && (
          <div className="space-y-6">
            {/* Hero */}
            {hero && (
              <a
                href={hero.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow group"
              >
                {hero.urlToImage && (
                  <div className="w-3/5 flex-shrink-0" style={{ height: '320px' }}>
                    <img
                      src={hero.urlToImage}
                      alt={hero.title}
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}
                <div className="flex flex-col justify-center p-8 flex-1">
                  <span className="self-start mb-3 flex items-center gap-1">
                    <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${sourceLabelClass(hero.source?.name)}`}>
                      {hero.source?.name || 'Unknown'}
                    </span>
                    {hero.isLive && <span className="text-xs font-bold text-green-600">🟢 LIVE</span>}
                  </span>
                  <h1 className="text-2xl font-bold text-gray-900 leading-snug mb-3 group-hover:text-blue-700 transition-colors">
                    {hero.title}
                  </h1>
                  {hero.description && (
                    <p className="text-gray-600 text-sm leading-relaxed line-clamp-3 mb-4">
                      {hero.description}
                    </p>
                  )}
                  <StockPills headline={hero.title} description={hero.description || ''} />
                  <span className="text-xs text-gray-400 mt-2">{timeAgo(hero.publishedAt)}</span>
                </div>
              </a>
            )}

            {/* Featured 3-column */}
            {featured.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {featured.map((article, i) => (
                  <a
                    key={i}
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-white border border-gray-100 rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow group flex flex-col"
                  >
                    {article.urlToImage && (
                      <div className="overflow-hidden bg-gray-100" style={{ height: '180px' }}>
                        <img
                          src={article.urlToImage}
                          alt={article.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      </div>
                    )}
                    <div className="p-4 flex flex-col flex-1">
                      <span className="flex items-center gap-1 mb-2">
                        <span className="text-xs font-semibold text-red-600 uppercase tracking-wide">
                          {article.source?.name || 'Unknown'}
                        </span>
                        {article.isLive && <span className="text-xs font-bold text-green-600">🟢 LIVE</span>}
                      </span>
                      <h2 className="font-semibold text-gray-900 text-base leading-snug group-hover:text-blue-700 transition-colors line-clamp-3">
                        {article.title}
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
                        <span className={`flex-shrink-0 text-xs font-bold uppercase px-2 py-0.5 rounded ${sourceLabelClass(article.source?.name)}`}>
                          {article.source?.name || 'Unknown'}
                        </span>
                        {article.isLive && <span className="flex-shrink-0 text-xs font-bold text-green-600">🟢 LIVE</span>}
                        <span className="font-medium text-gray-900 text-sm line-clamp-1 group-hover:text-blue-700 transition-colors">
                          {article.title}
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
            No articles found. Try a different category or region.
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

        {/* Sector Performance */}
        <section>
          <SectionHeader>📊 Sector Performance</SectionHeader>
          {sectorLoading ? (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="min-w-[120px] flex-shrink-0 bg-white border border-gray-200 rounded p-3 animate-pulse">
                  <div className="h-2 bg-gray-100 rounded mb-2 w-3/4" />
                  <div className="h-2 bg-gray-50 rounded mb-3 w-1/2" />
                  <div className="h-5 bg-gray-100 rounded w-full" />
                </div>
              ))}
            </div>
          ) : sectorData.length > 0 ? (
            <div className="flex overflow-x-auto gap-3 pb-2">
              {sectorData.map(s => (
                <div
                  key={s.ticker}
                  className={`min-w-[120px] flex-shrink-0 bg-white border border-gray-200 rounded p-3 text-center ${
                    s.changePercent >= 0 ? 'border-l-2 border-l-black' : 'border-l-2 border-l-gray-300'
                  }`}
                >
                  <p className="text-xs text-gray-500 uppercase tracking-wide leading-tight mb-0.5">{s.sectorName}</p>
                  <p className="text-xs text-gray-400 mb-2">{s.ticker}</p>
                  <p className={`text-lg font-bold leading-none ${s.changePercent >= 0 ? 'text-black' : 'text-gray-400'}`}>
                    {s.changePercent >= 0 ? '▲' : '▼'}&nbsp;{Math.abs(s.changePercent).toFixed(2)}%
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {/* Global Economy */}
        <section>
          <SectionHeader>🌍 Global Economy</SectionHeader>
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
                  <p className="text-xs uppercase tracking-widest font-bold text-gray-500 border-b border-gray-200 pb-2 mb-3">
                    {col.label}
                  </p>
                  <div className="space-y-5">
                    {col.articles.map((a, i) => (
                      <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="block group">
                        {a.urlToImage ? (
                          <div className="h-28 bg-gray-100 rounded overflow-hidden mb-2">
                            <img
                              src={a.urlToImage}
                              alt=""
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          </div>
                        ) : (
                          <div className="h-28 bg-gray-100 rounded mb-2" />
                        )}
                        <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">{a.source?.name}</p>
                        <p className="text-sm font-medium text-gray-900 leading-snug group-hover:text-black">{a.title}</p>
                        <p className="text-xs text-gray-400 mt-1">{timeAgo(a.publishedAt)}</p>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {/* Today's Briefing */}
        <section>
          <SectionHeader>📰 Today&apos;s Briefing</SectionHeader>
          {topicNewsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="space-y-0">
                  <div className="h-5 bg-gray-100 rounded w-1/2 mb-4 animate-pulse" />
                  {[...Array(4)].map((_, j) => (
                    <div key={j} className="border-b border-gray-100 py-3 animate-pulse">
                      <div className="h-2.5 bg-gray-100 rounded w-1/4 mb-2" />
                      <div className="h-3.5 bg-gray-100 rounded w-full mb-1" />
                      <div className="h-3.5 bg-gray-100 rounded w-3/4" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : topicNews ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {([
                { label: 'Markets & Finance',     articles: topicNews.markets },
                { label: 'Technology & AI',        articles: topicNews.tech },
                { label: 'Geopolitics & Economy',  articles: topicNews.geopolitics },
              ] as { label: string; articles: Article[] }[]).map(col => (
                <div key={col.label}>
                  <p className="text-sm font-bold text-black uppercase tracking-wide border-b-2 border-black pb-2 mb-4">
                    {col.label}
                  </p>
                  <div>
                    {col.articles.map((a, i) => (
                      <a
                        key={i}
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block border-b border-gray-100 py-3 hover:bg-gray-50 px-1 -mx-1 transition-colors group"
                      >
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{a.source?.name}</p>
                        <p className="text-sm text-gray-800 group-hover:text-black leading-snug font-medium">{a.title}</p>
                        <p className="text-xs text-gray-400 mt-1">{timeAgo(a.publishedAt)}</p>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

      </div>

      <section className="max-w-7xl mx-auto px-4 py-10 border-t border-gray-100">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">
            💬 Market Chatter
          </h2>
          <a href="https://stocktwits.com" target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 hover:text-black">
            Powered by Stocktwits →
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
