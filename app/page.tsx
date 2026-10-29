'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { fetchData, fetchJson, DataRequestError, DataRequestTimeout } from '@/lib/dataRequest';
import { decodeHtml } from '@/lib/decodeHtml';
import Link from 'next/link';
import Header from '@/components/Header';
import MarketPulseDashboard from '@/components/MarketPulseDashboard';
import MarketChatter from '@/components/MarketChatter';
import NewsletterSignup from '@/components/NewsletterSignup';

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

interface Brief {
  headline: string;
  summary: string;
  sources: { name: string; url: string }[];
}

const CATEGORIES = [
  { label: 'Briefing', value: 'briefing', keywords: [] as string[] },
  { label: 'Markets', value: 'markets', keywords: ['market', 'stock', 'shares', 'index', 'bond', 'yield', 'nasdaq', 'dow', 's&p', 'trading', 'earnings'] },
  { label: 'AI & Tech', value: 'ai-tech', keywords: ['technology', 'tech', 'ai', 'artificial intelligence', 'software', 'chip', 'semiconductor', 'cloud', 'cyber', 'robot'] },
  { label: 'Geopolitics', value: 'geopolitics', keywords: ['politic', 'government', 'election', 'policy', 'war', 'sanction', 'geopolit', 'military', 'trade', 'tariff'] },
];

const INTELLIGENCE_KEYWORDS = CATEGORIES.slice(1).flatMap(item => item.keywords);

const DEFAULT_FALLBACK = 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1800&q=90';
const FALLBACKS = [
  { words: ['ai', 'chip', 'semiconductor', 'technology', 'cloud'], image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1400&q=90' },
  { words: ['oil', 'energy', 'gas', 'opec'], image: 'https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?w=1400&q=90' },
  { words: ['trade', 'shipping', 'port', 'supply chain'], image: 'https://images.unsplash.com/photo-1494412519320-aa613dfb7738?w=1400&q=90' },
  { words: ['government', 'election', 'war', 'geopolit'], image: 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=1400&q=90' },
];

const VIDEO_CHANNELS = [
  { name: 'CNBC', url: 'https://www.youtube.com/@CNBC', initials: 'C', color: '#c80000' },
  { name: 'Bloomberg', url: 'https://www.youtube.com/@Bloomberg', initials: 'B', color: '#1167ee' },
  { name: 'Yahoo Finance', url: 'https://www.youtube.com/@YahooFinance', initials: 'YF', color: '#6001d2' },
  { name: 'The Economist', url: 'https://www.youtube.com/@TheEconomist', initials: 'TE', color: '#e3120b' },
];

function hasKeyword(text: string, keyword: string) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - Date.parse(dateStr);
  if (!Number.isFinite(diff) || diff < 0) return 'Date unavailable';
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function articleImage(article: Article) {
  if (article.urlToImage) return article.urlToImage;
  const text = `${article.title} ${article.description}`.toLowerCase();
  return FALLBACKS.find(item => item.words.some(word => hasKeyword(text, word)))?.image || DEFAULT_FALLBACK;
}

function categoryFor(article: Article) {
  const text = `${article.title} ${article.description}`.toLowerCase();
  if (CATEGORIES[2].keywords.some(word => hasKeyword(text, word))) return 'AI & TECH';
  if (CATEGORIES[3].keywords.some(word => hasKeyword(text, word))) return 'GEOPOLITICS';
  return 'MARKETS';
}

function intelligenceScore(article: Article) {
  const text = `${article.title} ${article.description}`.toLowerCase();
  const topicMatches = INTELLIGENCE_KEYWORDS.reduce((score, word) => score + Number(hasKeyword(text, word)), 0);
  return topicMatches * 10 + Number(Boolean(article.urlToImage)) * 3 + Number(Boolean(article.description));
}

function ArticleImage({ article, sizes, priority = false }: { article: Article; sizes: string; priority?: boolean }) {
  return (
    <Image unoptimized
      src={articleImage(article)}
      alt={decodeHtml(article.title)}
      fill
      priority={priority}
      sizes={sizes}
      className="object-cover transition-transform duration-500 group-hover:scale-[1.025]"
      onError={event => {
        if (event.currentTarget.getAttribute('src') === DEFAULT_FALLBACK) event.currentTarget.style.display = 'none';
        else event.currentTarget.src = DEFAULT_FALLBACK;
      }}
    />
  );
}

export default function Home() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [briefsError, setBriefsError] = useState('');
  const [category, setCategory] = useState('briefing');
  const [query, setQuery] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [partialNews, setPartialNews] = useState(false);

  useEffect(() => {
    let active = true;
    let latestRequest = 0;
    let controller: AbortController | null = null;
    async function fetchNews() {
      const request = ++latestRequest;
      controller?.abort();
      controller = new AbortController();
      const isCurrent = () => active && request === latestRequest;
      try {
        let url = '/api/news?';
        if (query) {
          url += `q=${encodeURIComponent(query)}`;
        } else {
          url += 'region=us';
        }
        const { data, headers } = await fetchData(url, { signal: controller.signal }, 12000);
        if (data.status !== 'ok' || !Array.isArray(data.articles)) throw new Error('Invalid news response');
        if (!isCurrent()) return;
        setError('');
        setPartialNews(headers.get('X-News-Data-Partial') === 'true');
        setArticles(data.articles.filter((a: Article) => a && a.title !== '[Removed]'));
      } catch (error) {
        if (isCurrent()) setError(error instanceof DataRequestTimeout
          ? 'News took too long. Please try again.' : 'News is temporarily unavailable. Please try again.');
      } finally {
        if (isCurrent()) setLoading(false);
      }
    }
    void fetchNews();
    const id = setInterval(() => { setLoading(true); setError(''); void fetchNews(); }, 300000);
    return () => { active = false; controller?.abort(); clearInterval(id); };
  }, [query, refreshVersion]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadBriefs() {
      try {
        const data = await fetchJson('/api/briefs', { signal: controller.signal }, 15000);
        if (controller.signal.aborted) return;
        if (data.status !== 'ok' || !Array.isArray(data.briefs)) {
          setBriefs([]);
          setBriefsError('AI summaries are temporarily unavailable. Please try again.');
          return;
        }
        setBriefs(data.briefs); setBriefsError('');
      } catch (error) {
        if (!controller.signal.aborted) {
          setBriefs([]);
          setBriefsError(error instanceof DataRequestTimeout || (error instanceof DataRequestError && error.status === 504)
            ? 'AI summaries timed out. Please try again.'
            : error instanceof DataRequestError && error.status === 429
              ? 'AI summaries are busy. Please try again shortly.'
              : 'AI summaries are temporarily unavailable. Please try again.');
        }
      }
    }
    void loadBriefs();
    return () => controller.abort();
  }, []);

  const visibleArticles = useMemo(() => {
    const active = CATEGORIES.find(item => item.value === category) || CATEGORIES[0];
    if (query) return articles;
    if (active.keywords.length === 0) {
      const intelligenceArticles = articles.filter(article => {
        const text = `${article.title} ${article.description}`.toLowerCase();
        return INTELLIGENCE_KEYWORDS.some(word => hasKeyword(text, word));
      });
      return intelligenceArticles.length >= 8 ? intelligenceArticles : articles;
    }
    const filtered = articles.filter(article => {
      const text = `${article.title} ${article.description}`.toLowerCase();
      return active.keywords.some(word => hasKeyword(text, word));
    });
    return filtered.length >= 4 ? filtered : articles;
  }, [articles, category, query]);

  const ordered = useMemo(
    () => [...visibleArticles].sort((a, b) => intelligenceScore(b) - intelligenceScore(a)),
    [visibleArticles],
  );
  const hero = ordered[0];
  const supporting = ordered.slice(1, 3);
  const latest = ordered.slice(3, 11);
  const nonHeroBriefs = briefs.filter(item => decodeHtml(item.headline) !== decodeHtml(hero?.title || ''));
  const briefItems = briefs.length
    ? (nonHeroBriefs.length ? nonHeroBriefs : briefs).slice(0, 5)
    : latest.slice(0, 5).map(article => ({ headline: decodeHtml(article.title), summary: '', sources: [{ name: article.source?.name || 'Source', url: article.url }] }));

  const marketBrief = (
            <aside className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
              <div className="flex items-center justify-between border-b border-[#e5e7eb] px-4 py-4">
                <h2 className="text-[19px] font-normal tracking-[-0.025em]">Today&apos;s Market Brief</h2>
                <span className="text-[11px] font-semibold text-[#1167ee]">Essential</span>
              </div>
              <ol className="divide-y divide-[#e5e7eb]">
                {briefItems.map((brief, index) => (
                  <li key={`${brief.headline}-${index}`} className="grid grid-cols-[26px_7px_1fr] gap-2 px-4 py-3">
                    <span className="font-mono text-[11px] text-[#73808a]">{String(index + 1).padStart(2, '0')}</span>
                    <span className={`mt-1.5 h-2 w-2 rounded-full ${index < 2 ? 'bg-[#28b979]' : index === 2 ? 'bg-[#ff5a52]' : 'bg-[#e3a51a]'}`} />
                    <div>
                      <p className="text-[12px] font-normal leading-[1.3] text-[#0c0a08] line-clamp-2">{decodeHtml(brief.headline)}</p>
                      <div className="mt-1.5 flex gap-2">
                        {brief.sources.slice(0, 1).map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-semibold text-[#1167ee] hover:underline">{source.name}</a>)}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </aside>
  );

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setRefreshVersion(version => version + 1);
  }

  return (
    <main className="min-h-screen bg-[#f4f2f0] text-[#0c0a08]">
      <header className="sticky top-0 z-40 border-b border-[#e5e7eb] bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[74px] max-w-[1200px] items-center gap-5 px-4 sm:px-6">
          <Link href="/" className="mr-auto flex min-w-0 shrink-0 flex-col items-start justify-center">
            <span className="text-[30px] font-semibold leading-[0.9] tracking-[-0.055em] text-[#0c0a08]">Invest<span className="text-[#1167ee]">Radar</span></span>
            <span className="mt-1 text-[9px] font-normal leading-none tracking-[-0.01em] text-[#6d6c6b] sm:text-[10px]">Financial &amp; Geopolitical Intelligence</span>
          </Link>

          <nav aria-label="Primary navigation" className="hidden h-[74px] items-stretch gap-5 lg:flex xl:gap-7">
            {CATEGORIES.map(item => (
              <button key={item.value} onClick={() => { setCategory(item.value); if (query) { setLoading(true); setError(''); setQuery(''); } }} className={`border-b-2 px-0 text-[13px] font-medium tracking-[-0.01em] transition-colors ${category === item.value && !query ? 'border-[#1167ee] text-[#0c0a08]' : 'border-transparent text-[#343434] hover:text-[#1167ee]'}`}>
                {item.label}
              </button>
            ))}
          </nav>

          <form onSubmit={submitSearch} className="hidden items-center gap-2 md:flex">
            <label className="relative block">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7a8791]">⌕</span>
              <input value={query} onChange={event => { setLoading(true); setError(''); setQuery(event.target.value); }} placeholder="Search markets, companies, topics..." className="h-11 w-52 rounded-[10px] border border-[#e5e7eb] bg-white pl-9 pr-3 text-xs outline-none transition-colors focus:border-[#0c0a08] xl:w-64" />
            </label>
          </form>
          <button aria-label="Open watchlist" className="hidden h-11 w-11 place-items-center rounded-[10px] border border-[#e5e7eb] bg-white text-xl transition-colors hover:border-[#0c0a08] sm:grid">☆</button>
          <Header />
        </div>
        <nav aria-label="Primary navigation" className="flex overflow-x-auto border-t border-[#e5e7eb] px-4 lg:hidden">
          {CATEGORIES.map(item => (
            <button key={item.value} onClick={() => { setCategory(item.value); if (query) { setLoading(true); setError(''); setQuery(''); } }} className={`mr-6 whitespace-nowrap border-b-2 py-3 text-xs font-medium tracking-[-0.01em] ${category === item.value && !query ? 'border-[#1167ee] text-[#0c0a08]' : 'border-transparent text-[#343434]'}`}>
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="mx-auto max-w-[1200px] px-4 py-4 sm:px-6 lg:py-5">
        {error && <div role="alert" className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {!loading && !error && partialNews && <p role="status" className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Some news sources are temporarily unavailable. Showing available news.</p>}

        {briefsError && <p role="status" className="mb-4 text-xs text-[#617080]">{briefsError} {briefItems.length > 0 && 'Showing news headlines in the market brief.'}</p>}

        {loading ? (
          <div className="grid min-h-[376px] animate-pulse gap-3 lg:grid-cols-[1.62fr_1.14fr_1fr]">
            <div className="rounded-2xl bg-[#e5e7eb]" />
            <div className="rounded-2xl bg-[#e5e7eb]" />
            <div className="rounded-2xl bg-[#e5e7eb]" />
          </div>
        ) : hero ? (
          <section className="grid gap-3 lg:grid-cols-[1.62fr_1.14fr_1fr] lg:items-stretch">
            <a href={hero.url} target="_blank" rel="noopener noreferrer" className="group relative min-h-[420px] overflow-hidden rounded-2xl bg-[#171721] sm:min-h-[480px] lg:min-h-[376px]">
              <ArticleImage article={hero} priority sizes="(max-width: 1023px) 100vw, 48vw" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-7">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-normal uppercase tracking-[0.05em]">
                  <span>{categoryFor(hero)}</span>
                  {hero.isLive && <span className="rounded border border-emerald-300/70 px-1.5 py-0.5 text-emerald-200">LIVE</span>}
                </div>
                <h1 className="max-w-3xl text-[34px] font-normal leading-[1.02] tracking-[-0.035em] sm:text-[44px] lg:text-[40px] line-clamp-3">{decodeHtml(hero.title)}</h1>
                {hero.description && <p className="mt-3 max-w-2xl text-[13px] leading-[1.45] text-white/80 line-clamp-2">{decodeHtml(hero.description)}</p>}
                <p className="mt-3 text-[11px] text-white/65">{timeAgo(hero.publishedAt)}</p>
              </div>
            </a>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {supporting.map(article => (
                <a key={article.url} href={article.url} target="_blank" rel="noopener noreferrer" className="group grid min-h-44 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white sm:grid-rows-[1fr_auto] lg:grid-cols-[46%_1fr] lg:grid-rows-1">
                  <div className="relative min-h-40 overflow-hidden bg-[#e5e1d8] lg:min-h-0"><ArticleImage article={article} sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 16vw" /></div>
                  <div className="flex flex-col justify-center p-3.5">
                    <p className="mb-2 text-[9px] font-normal tracking-[0.05em] text-[#1167ee]">{categoryFor(article)}</p>
                    <h2 className="text-[17px] font-normal leading-[1.08] tracking-[-0.02em] text-[#0c0a08] line-clamp-4 group-hover:text-[#1167ee]">{decodeHtml(article.title)}</h2>
                    <p className="mt-3 text-[11px] text-[#7a8791]">{timeAgo(article.publishedAt)}</p>
                  </div>
                </a>
              ))}
            </div>

            {marketBrief}
          </section>
        ) : null}

        {(loading || !hero) && briefItems.length > 0 && marketBrief}

        <div className="mt-5"><MarketPulseDashboard /></div>

        {latest.length > 0 && (
          <section className="mt-7">
            <div className="flex items-center gap-7 overflow-x-auto border-b border-[#d9d7d0]">
              {CATEGORIES.map(item => (
                <button key={item.value} onClick={() => { setCategory(item.value); if (query) { setLoading(true); setError(''); setQuery(''); } }} className={`whitespace-nowrap border-b-2 py-3 text-xs font-semibold ${category === item.value ? 'border-[#1167ee] text-[#1167ee]' : 'border-transparent text-[#617080]'}`}>
                  {item.value === 'briefing' ? 'Latest' : item.label}
                </button>
              ))}
            </div>
            <div className="grid gap-x-6 gap-y-7 py-5 sm:grid-cols-2 lg:grid-cols-4">
              {latest.map(article => (
                <a key={article.url} href={article.url} target="_blank" rel="noopener noreferrer" className="group grid grid-cols-[112px_1fr] gap-4 border-b border-[#dedbd3] pb-5 sm:grid-cols-1 sm:border-b-0 sm:pb-0">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-[#e4e0d8]"><ArticleImage article={article} sizes="(max-width: 639px) 112px, (max-width: 1023px) 50vw, 24vw" /></div>
                  <div>
                    <p className="mb-1.5 text-[9px] font-bold tracking-[0.08em] text-[#1167ee]">{categoryFor(article)}</p>
                    <h3 className="font-serif text-[20px] leading-[1.08] tracking-[-0.02em] group-hover:text-[#1167ee]">{decodeHtml(article.title)}</h3>
                    <p className="mt-2 text-xs leading-relaxed text-[#687682] line-clamp-2">{decodeHtml(article.description)}</p>
                    <p className="mt-2 text-[10px] text-[#8b959d]">{timeAgo(article.publishedAt)}</p>
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        <section className="mt-8 grid gap-6 border-t border-[#d9d7d0] pt-8 lg:grid-cols-[1fr_1.15fr]">
          <div>
            <div className="mb-4 flex items-end justify-between">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7a8791]">Watch next</p><h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em]">Market Videos</h2></div>
              <Link href="/videos" className="text-xs font-semibold text-[#1167ee]">See all →</Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {VIDEO_CHANNELS.map(channel => (
                <a key={channel.name} href={channel.url} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-[#d9d7d0] bg-[#fffdf8] p-4 transition-colors hover:border-[#1167ee]">
                  <span className="grid h-9 w-9 place-items-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: channel.color }}>{channel.initials}</span>
                  <p className="mt-3 text-xs font-semibold">{channel.name}</p><p className="mt-1 text-[10px] text-[#7a8791]">YouTube channel</p>
                </a>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-4"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7a8791]">Investor attention</p><h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em]">Social Pulse</h2></div>
            <MarketChatter />
          </div>
        </section>

        <div className="mt-10"><NewsletterSignup /></div>
      </div>

      <footer className="border-t border-[#d9d7d0] bg-[#fffdf8] px-6 py-7 text-center text-[11px] text-[#7a8791]">© 2026 InvestRadar · Financial &amp; Geopolitical Intelligence</footer>
    </main>
  );
}
