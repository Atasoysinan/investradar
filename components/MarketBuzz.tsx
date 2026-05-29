'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface TrendingItem {
  symbol: string;
  rank: number;
  price: number | null;
  dp: number | null;
  isCrypto: boolean;
  cryptoId?: string;
}

interface RedditItem {
  title: string;
  score: number;
  subreddit: string;
  tickers: string[];
  url: string;
}

interface CoinBuzzItem {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
}

interface StocktwitItem {
  symbol: string;
  name: string;
  watchlist_count: number;
  sentiment: string | null;
}

interface TrendingData {
  trending: TrendingItem[];
  reddit: RedditItem[];
  coins: CoinBuzzItem[];
}

type Tab = 'trending' | 'social' | 'reddit' | 'crypto';

const ROW = 'flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0';

function fmtPrice(p: number): string {
  return p >= 1000
    ? `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${p.toFixed(2)}`;
}

export default function MarketBuzz() {
  const [data, setData] = useState<TrendingData | null>(null);
  const [stocktwitsData, setStocktwitsData] = useState<StocktwitItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('trending');

  const load = async () => {
    setLoading(true);
    try {
      const [trendingResult, stocktwitsResult] = await Promise.allSettled([
        fetch('/api/trending').then(r => r.json()),
        fetch('/api/stocktwits').then(r => r.json()),
      ]);
      if (trendingResult.status === 'fulfilled') setData(trendingResult.value);
      if (stocktwitsResult.status === 'fulfilled' && Array.isArray(stocktwitsResult.value)) {
        setStocktwitsData(stocktwitsResult.value);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const skeleton = [...Array(7)].map((_, i) => (
    <div key={i} className="px-3 py-2.5 flex items-center justify-between animate-pulse border-b border-gray-100">
      <div className="space-y-1.5 flex-1">
        <div className="h-3 bg-gray-100 rounded w-1/3" />
        <div className="h-2.5 bg-gray-50 rounded w-1/2" />
      </div>
      <div className="h-4 bg-gray-100 rounded w-14 ml-3 flex-shrink-0" />
    </div>
  ));

  const TABS: [Tab, string][] = [
    ['trending', 'Trending'],
    ['social',   'Social'],
    ['reddit',   'Reddit'],
    ['crypto',   'Crypto'],
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="text-xs font-bold text-black uppercase tracking-widest">Market Buzz</h2>
        <button
          onClick={load}
          className="text-xs text-gray-400 hover:text-black transition-colors px-2 py-1 rounded border border-gray-200"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 px-1">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-3 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
              activeTab === id
                ? 'border-black text-black font-semibold'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div>
        {loading ? skeleton : activeTab === 'trending' ? (
          data?.trending.length ? data.trending.map((item) => (
            <Link
              key={item.symbol}
              href={
                item.isCrypto && item.cryptoId
                  ? `/crypto/${item.cryptoId}`
                  : item.symbol.endsWith('-USD')
                  ? `/crypto/${item.symbol.replace('-USD', '').toLowerCase()}`
                  : `/stocks/${item.symbol}`
              }
              className={ROW}
            >
              <span className="text-xs text-gray-400 w-5 text-right flex-shrink-0">#{item.rank}</span>
              <span className="text-black font-bold text-sm w-14 flex-shrink-0">{item.symbol}</span>
              <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                {item.price != null ? (
                  <>
                    <span className="text-black text-xs">{fmtPrice(item.price)}</span>
                    <span className={`text-xs font-medium flex-shrink-0 ${(item.dp ?? 0) >= 0 ? 'text-black' : 'text-gray-500'}`}>
                      {(item.dp ?? 0) >= 0 ? '▲' : '▼'} {Math.abs(item.dp ?? 0).toFixed(2)}%
                    </span>
                  </>
                ) : (
                  <span className="text-gray-300 text-xs">—</span>
                )}
              </div>
            </Link>
          )) : <p className="px-4 py-8 text-gray-400 text-xs text-center">No trending data</p>

        ) : activeTab === 'social' ? (
          stocktwitsData.length ? stocktwitsData.map((item) => (
            <Link key={item.symbol} href={`/stocks/${item.symbol}`} className={ROW}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-black font-bold text-sm">{item.symbol}</span>
                  <span className="text-gray-400 text-xs truncate">{item.name}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                <span className="text-gray-500 text-xs">
                  {item.watchlist_count >= 1000
                    ? `${(item.watchlist_count / 1000).toFixed(0)}K`
                    : `${item.watchlist_count}`} watching
                </span>
                {item.sentiment && (
                  <span className={`text-xs font-medium ${item.sentiment === 'Bullish' ? 'text-black' : 'text-gray-500'}`}>
                    {item.sentiment}
                  </span>
                )}
              </div>
            </Link>
          )) : <p className="px-4 py-8 text-gray-400 text-xs text-center">No social data</p>

        ) : activeTab === 'reddit' ? (
          data?.reddit.length ? data.reddit.map((item, i) => (
            <a
              key={i}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-3 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0"
            >
              <div className="flex items-start gap-2">
                <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">#{i + 1}</span>
                <p className="text-gray-800 text-xs leading-snug">
                  {item.title.length > 60 ? item.title.substring(0, 60) + '…' : item.title}
                </p>
              </div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap pl-5">
                {item.tickers.slice(0, 3).map(t => (
                  <span key={t} className="text-xs text-black font-semibold">{t}</span>
                ))}
                <span className="text-xs text-gray-400 ml-auto">▲ {item.score.toLocaleString()}</span>
              </div>
            </a>
          )) : <p className="px-4 py-8 text-gray-400 text-xs text-center">No Reddit data</p>

        ) : (
          data?.coins?.length ? data.coins.map((coin, i) => (
            <Link key={coin.id} href={`/crypto/${coin.id}`} className={ROW}>
              <span className="text-xs text-gray-400 w-5 text-right flex-shrink-0">#{i + 1}</span>
              <div className="w-16 flex-shrink-0">
                <span className="text-black font-bold text-xs uppercase">{coin.symbol}</span>
                <p className="text-gray-400 text-xs truncate">{coin.name}</p>
              </div>
              <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                <span className="text-black text-xs">{fmtPrice(coin.current_price)}</span>
                <span className={`text-xs font-medium flex-shrink-0 ${coin.price_change_percentage_24h >= 0 ? 'text-black' : 'text-gray-500'}`}>
                  {coin.price_change_percentage_24h >= 0 ? '▲' : '▼'} {Math.abs(coin.price_change_percentage_24h).toFixed(2)}%
                </span>
              </div>
            </Link>
          )) : <p className="px-4 py-8 text-gray-400 text-xs text-center">No crypto data</p>
        )}
      </div>
    </div>
  );
}
