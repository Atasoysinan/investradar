'use client';

import { useEffect, useState } from 'react';

interface TrendingItem {
  symbol: string;
  rank: number;
}

interface RedditItem {
  title: string;
  score: number;
  tickers: string[];
}

interface TrendingData {
  trending: TrendingItem[];
  reddit: RedditItem[];
}

const RANK_COLORS = ['text-yellow-400', 'text-gray-300', 'text-amber-600'];

export default function MarketBuzz() {
  const [data, setData] = useState<TrendingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'trending' | 'reddit'>('trending');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/trending');
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider">Market Buzz</h2>
        <button
          onClick={load}
          className="text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-gray-800"
        >
          ↻ Refresh
        </button>
      </div>

      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setActiveTab('trending')}
          className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
            activeTab === 'trending'
              ? 'bg-gray-800 text-white'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
          }`}
        >
          🔥 Trending
        </button>
        <button
          onClick={() => setActiveTab('reddit')}
          className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
            activeTab === 'reddit'
              ? 'bg-gray-800 text-white'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
          }`}
        >
          📢 Reddit Buzz
        </button>
      </div>

      <div className="divide-y divide-gray-800">
        {loading ? (
          [...Array(7)].map((_, i) => (
            <div key={i} className="px-4 py-3 flex items-center justify-between animate-pulse">
              <div className="space-y-1.5 flex-1">
                <div className="h-3 bg-gray-700 rounded w-1/3" />
                <div className="h-2.5 bg-gray-800 rounded w-1/2" />
              </div>
              <div className="h-5 bg-gray-700 rounded w-10 ml-3 flex-shrink-0" />
            </div>
          ))
        ) : activeTab === 'trending' ? (
          data?.trending.length ? (
            data.trending.map((item) => (
              <div key={item.symbol} className="px-4 py-2.5 flex items-center justify-between hover:bg-gray-800 transition-colors">
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-bold w-5 text-right flex-shrink-0 ${RANK_COLORS[item.rank - 1] ?? 'text-gray-500'}`}>
                    #{item.rank}
                  </span>
                  <span className="text-green-400 font-bold text-sm">${item.symbol}</span>
                </div>
                <span className="text-xs bg-blue-900 text-blue-300 px-2 py-0.5 rounded-full">
                  Yahoo
                </span>
              </div>
            ))
          ) : (
            <p className="px-4 py-8 text-gray-500 text-xs text-center">No trending data</p>
          )
        ) : (
          data?.reddit.length ? (
            data.reddit.map((item, i) => (
              <div key={i} className="px-4 py-2.5 hover:bg-gray-800 transition-colors">
                <p className="text-gray-200 text-xs leading-snug">
                  {item.title.length > 80 ? item.title.substring(0, 80) + '…' : item.title}
                </p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {item.tickers.slice(0, 3).map(t => (
                    <span key={t} className="text-xs text-green-400 font-semibold">${t}</span>
                  ))}
                  <span className="text-xs text-gray-500 ml-auto">▲ {item.score.toLocaleString()}</span>
                </div>
              </div>
            ))
          ) : (
            <p className="px-4 py-8 text-gray-500 text-xs text-center">No Reddit data</p>
          )
        )}
      </div>
    </div>
  );
}
