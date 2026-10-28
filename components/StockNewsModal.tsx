'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

interface NewsItem {
  id: number;
  headline: string;
  summary: string;
  url: string;
  source: string;
  datetime: number;
  image: string;
}

interface Quote {
  c: number;
  d: number;
  dp: number;
  h: number;
  l: number;
  o: number;
  pc: number;
}

const REQUEST_TIMEOUT_MS = 10_000;
class StockNewsTimeout extends Error {}

function isWebUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; }
}

function parseNews(value: unknown): NewsItem[] {
  if (!Array.isArray(value)) throw new Error('Invalid stock news');
  return value.map(item => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'number' || !Number.isFinite(item.id)
      || typeof item.headline !== 'string' || !item.headline.trim() || !isWebUrl(item.url)
      || typeof item.source !== 'string' || typeof item.datetime !== 'number' || !Number.isFinite(item.datetime)) {
      throw new Error('Invalid stock news');
    }
    return { ...item, summary: typeof item.summary === 'string' ? item.summary : '', image: isWebUrl(item.image) ? item.image : '' };
  });
}

function parseQuote(value: unknown): Quote {
  if (!value || typeof value !== 'object') throw new Error('Invalid stock quote');
  const quote = value as Record<string, unknown>;
  if (!['c', 'd', 'dp', 'h', 'l', 'o', 'pc'].every(field => typeof quote[field] === 'number' && Number.isFinite(quote[field]))
    || (quote.c as number) <= 0) throw new Error('Invalid stock quote');
  return quote as unknown as Quote;
}

export default function StockNewsModal({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  // A different symbol starts with fresh state before its first render.
  return <StockNewsContent key={symbol} symbol={symbol} onClose={onClose} />;
}

function StockNewsContent({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [newsError, setNewsError] = useState('');
  const [quoteError, setQuoteError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let cancel: (reason: Error) => void = () => {};
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => {
      cancel = reject;
      timer = setTimeout(() => { reject(new StockNewsTimeout()); controller.abort(); }, REQUEST_TIMEOUT_MS);
    });
    async function read(url: string) {
      return Promise.race([deadline, (async () => {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error('Stock request failed');
        return response.json();
      })()]);
    }
    async function loadNews() {
      try {
        const data = parseNews(await read(`/api/market?symbol=${encodeURIComponent(symbol)}&type=news`));
        if (active) setNews(data);
      } catch (error) {
        if (active) { setNews([]); setNewsError(error instanceof StockNewsTimeout
          ? 'Stock news took too long. Please try again.' : 'Stock news is temporarily unavailable. Please try again.'); }
      } finally {
        if (active) setLoading(false);
      }
    }
    async function loadQuote() {
      try {
        const data = await read(`/api/market?symbol=${encodeURIComponent(symbol)}`);
        const value = parseQuote(data?.quote);
        if (active) setQuote(value);
      } catch (error) {
        if (active) { setQuote(null); setQuoteError(error instanceof StockNewsTimeout
          ? 'Price data took too long. Please try again.' : 'Price data is temporarily unavailable.'); }
      }
    }
    void Promise.all([loadNews(), loadQuote()]).finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); cancel(new Error('Cancelled')); controller.abort(); };
  }, [symbol, attempt]);

  function retry() {
    setNews([]); setQuote(null); setNewsError(''); setQuoteError(''); setLoading(true);
    setAttempt(value => value + 1);
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${symbol} stock news`}
        className="bg-gray-900 border border-gray-700 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-800 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">{symbol}</h2>
            {quote && (
              <>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-2xl font-semibold text-white">${quote.c?.toFixed(2)}</span>
                  <span className={`text-sm font-medium ${quote.dp >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {quote.dp >= 0 ? '▲' : '▼'} {Math.abs(quote.dp)?.toFixed(2)}% today
                  </span>
                </div>
                <div className="flex gap-4 mt-2 text-xs text-gray-500">
                  <span>O: ${quote.o?.toFixed(2)}</span>
                  <span>H: ${quote.h?.toFixed(2)}</span>
                  <span>L: ${quote.l?.toFixed(2)}</span>
                  <span>Prev: ${quote.pc?.toFixed(2)}</span>
                </div>
              </>
            )}
            {quoteError && <p role="status" className="text-xs text-amber-300 mt-2">{quoteError}</p>}
          </div>
          <button onClick={onClose} aria-label="Close stock news" className="text-gray-500 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-4">
          {loading ? (
            <div className="space-y-3" role="status" aria-label="Loading stock news">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="animate-pulse bg-gray-800 rounded-lg h-20" />
              ))}
            </div>
          ) : newsError ? (
            <p role="alert" className="text-amber-300 text-sm text-center py-8">{newsError}</p>
          ) : news.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">No recent news found.</p>
          ) : (
            <div className="space-y-3">
              {news.map(item => (
                <div
                  key={item.id}
                  className="flex gap-3 bg-gray-800 rounded-lg p-3 hover:bg-gray-700 transition-colors"
                >
                  {item.image && (
                    <Image unoptimized width={64} height={64}
                      src={item.image}
                      alt=""
                      className="w-16 h-16 object-cover rounded flex-shrink-0"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                  <div>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-gray-100 hover:text-blue-300 hover:underline transition-colors line-clamp-2 block"
                    >
                      {item.headline}
                    </a>
                    <p className="text-xs text-gray-500 mt-1">
                      {item.source} · {new Date(item.datetime * 1000).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {(newsError || quoteError) && <button onClick={retry} disabled={loading}
            className="mt-4 border border-gray-600 rounded px-3 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-50">Try again</button>}
        </div>
      </div>
    </div>
  );
}
