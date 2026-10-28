'use client';

import { fetchJson } from '@/lib/dataRequest';
import { useEffect, useState } from 'react';

function timeAgo(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n/1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n/1000).toFixed(0)}K`;
  return String(n);
}

interface Message {
  body: string;
  created_at: string;
  user: { username: string };
  sentiment: string | null;
}
interface Ticker {
  symbol: string;
  watchlist_count: number | null;
  messages: Message[];
}

export default function MarketChatter() {
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedStatus, setFeedStatus] = useState<'ok' | 'partial' | 'unavailable'>('ok');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const data = await fetchJson('/api/stocktwits-feed', { signal: controller.signal }, 12000);
        if (!Array.isArray(data.tickers)) throw new Error('Invalid Stocktwits feed');
        if (controller.signal.aborted) return;
        setTickers(data.tickers);
        setFeedStatus(data.status === 'partial' ? 'partial' : 'ok');
      } catch {
        if (!controller.signal.aborted) { setTickers([]); setFeedStatus('unavailable'); }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  if (loading) return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {[1,2,3].map(i => (
        <div key={i} className="space-y-2">
          <div className="h-6 bg-gray-100 rounded animate-pulse mb-3" />
          {[1,2,3].map(j => <div key={j} className="h-20 bg-gray-100 rounded animate-pulse" />)}
        </div>
      ))}
    </div>
  );

  if (tickers.length === 0) return (
    <p role="status" className="text-sm text-gray-500 py-6">
      {feedStatus === 'unavailable' ? 'Stocktwits conversations are temporarily unavailable.'
        : feedStatus === 'partial' ? 'Some Stocktwits conversations are unavailable. No recent messages from available sources.'
          : 'No recent Stocktwits conversations.'}
    </p>
  );

  return (
    <div>
      {feedStatus === 'partial' && <p role="status" className="text-sm text-gray-500 mb-4">Some Stocktwits conversations are unavailable. Showing available messages.</p>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {tickers.slice(0, 3).map(ticker => (
        <div key={ticker.symbol}>
          <div className="border-b-2 border-black pb-2 mb-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-lg font-bold text-black">${ticker.symbol}</span>
                {ticker.watchlist_count !== null && ticker.watchlist_count > 0 && (
                  <span className="text-xs text-gray-400 ml-2">{formatCount(ticker.watchlist_count)} watching</span>
                )}
              </div>
              <a
                href={`https://stocktwits.com/symbol/${ticker.symbol}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-400 hover:text-black transition-colors"
              >
                Stocktwits →
              </a>
            </div>
          </div>
          <div className="space-y-2">
            {ticker.messages.slice(0, 1).map((msg, i) => (
              <div key={i} className="bg-white border border-gray-100 rounded p-3 hover:border-gray-300 transition-colors overflow-hidden">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-gray-700">@{msg.user.username}</span>
                  {msg.sentiment === 'Bullish' && (
                    <span className="text-xs font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded">▲ Bullish</span>
                  )}
                  {msg.sentiment === 'Bearish' && (
                    <span className="text-xs font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded">▼ Bearish</span>
                  )}
                  <span className="text-xs text-gray-400 ml-auto">{timeAgo(msg.created_at)}</span>
                </div>
                <p className="text-sm text-gray-800 leading-relaxed break-words">{msg.body}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}
