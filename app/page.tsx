'use client';

import { useEffect, useState, useCallback } from 'react';

interface Article {
  title: string;
  description: string;
  url: string;
  urlToImage: string;
  publishedAt: string;
  source: { name: string };
  author: string;
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

export default function Home() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('business');
  const [country, setCountry] = useState('us');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMode, setActiveMode] = useState<'category' | 'topic'>('category');
  const [activeTopic, setActiveTopic] = useState('');

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
    } catch (e: any) {
      setError(e.message || 'Failed to load news');
    } finally {
      setLoading(false);
    }
  }, [category, country, searchQuery, activeMode, activeTopic]);

  useEffect(() => { fetchNews(); }, [fetchNews]);

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

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center font-bold text-sm">IR</div>
            <span className="text-xl font-bold text-white">InvestRadar</span>
            <span className="text-xs text-gray-500 hidden sm:block">Financial & Geopolitical Intelligence</span>
          </div>
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search markets, companies, topics..."
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm w-64 focus:outline-none focus:border-blue-500 text-gray-100 placeholder-gray-500"
            />
            <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              Search
            </button>
          </form>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Quick Topics */}
        <div className="mb-6">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Quick Topics</p>
          <div className="flex flex-wrap gap-2">
            {TOPICS.map(t => (
              <button
                key={t.query}
                onClick={() => handleTopicClick(t.query)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  activeTopic === t.query && activeMode === 'topic'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-6 pb-6 border-b border-gray-800">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Category</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(c => (
                <button
                  key={c.value}
                  onClick={() => { setCategory(c.value); setActiveMode('category'); setActiveTopic(''); setSearchQuery(''); }}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    category === c.value && activeMode === 'category'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Region</p>
            <div className="flex flex-wrap gap-2">
              {REGIONS.map(r => (
                <button
                  key={r.value}
                  onClick={() => { setCountry(r.value); setActiveMode('category'); setActiveTopic(''); setSearchQuery(''); }}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    country === r.value && activeMode === 'category'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-400">
            {loading ? 'Loading...' : error ? '' : `${articles.length} articles`}
            {activeMode === 'topic' && activeTopic && !loading && (
              <span className="ml-2 text-blue-400">· Topic search</span>
            )}
          </p>
          <button onClick={fetchNews} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
            ↻ Refresh
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-lg p-4 mb-6 text-red-400 text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-gray-900 rounded-xl p-4 animate-pulse">
                <div className="h-40 bg-gray-800 rounded-lg mb-3" />
                <div className="h-4 bg-gray-800 rounded w-3/4 mb-2" />
                <div className="h-4 bg-gray-800 rounded w-1/2" />
              </div>
            ))}
          </div>
        )}

        {/* Articles Grid */}
        {!loading && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {articles.map((article, i) => (
              <a
                key={i}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-600 transition-all hover:shadow-lg hover:shadow-black/40 group flex flex-col"
              >
                {article.urlToImage && (
                  <div className="h-44 overflow-hidden bg-gray-800">
                    <img
                      src={article.urlToImage}
                      alt={article.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}
                <div className="p-4 flex flex-col flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-blue-400 uppercase tracking-wide">
                      {article.source?.name || 'Unknown'}
                    </span>
                    <span className="text-xs text-gray-500">{timeAgo(article.publishedAt)}</span>
                  </div>
                  <h2 className="text-sm font-semibold text-gray-100 leading-snug mb-2 group-hover:text-blue-300 transition-colors line-clamp-3">
                    {article.title}
                  </h2>
                  {article.description && (
                    <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 mt-auto">
                      {article.description}
                    </p>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}

        {!loading && !error && articles.length === 0 && (
          <div className="text-center py-20 text-gray-500">
            No articles found. Try a different category or region.
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-12 py-6 text-center text-xs text-gray-600">
        InvestRadar · Powered by NewsAPI · Phase 1 MVP
      </footer>
    </div>
  );
}
