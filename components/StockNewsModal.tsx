'use client';

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

export default function StockNewsModal({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [newsRes, quoteRes] = await Promise.all([
        fetch(`/api/market?symbol=${symbol}&type=news`),
        fetch(`/api/market?symbol=${symbol}`),
      ]);
      const [newsData, quoteData] = await Promise.all([newsRes.json(), quoteRes.json()]);
      setNews(Array.isArray(newsData) ? newsData : []);
      setQuote(quoteData.quote ?? null);
      setLoading(false);
    };
    load();
  }, [symbol]);

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
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
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-4">
          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="animate-pulse bg-gray-800 rounded-lg h-20" />
              ))}
            </div>
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
                    <img
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
        </div>
      </div>
    </div>
  );
}
