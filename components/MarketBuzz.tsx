'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface TrendingItem {
  symbol: string;
  rank: number;
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
  price_change_percentage_24h: number;
}

interface TrendingData {
  trending: TrendingItem[];
  reddit: RedditItem[];
  coins: CoinBuzzItem[];
}

type Tab = 'trending' | 'reddit' | 'crypto';

const RANK_COLORS = ['text-yellow-400', 'text-gray-300', 'text-amber-600'];

const SUBREDDIT_COLORS: Record<string, string> = {
  'r/wallstreetbets': 'bg-orange-900 text-orange-300',
  'r/stocks': 'bg-blue-900 text-blue-300',
  'r/investing': 'bg-green-900 text-green-300',
};

export default function MarketBuzz() {
  const router = useRouter();
  const [data, setData] = useState<TrendingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('trending');

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

  const skeleton = [...Array(7)].map((_, i) => (
    <div key={i} className="px-4 py-3 flex items-center justify-between animate-pulse">
      <div className="space-y-1.5 flex-1">
        <div className="h-3 bg-gray-700 rounded w-1/3" />
        <div className="h-2.5 bg-gray-800 rounded w-1/2" />
      </div>
      <div className="h-5 bg-gray-700 rounded w-10 ml-3 flex-shrink-0" />
    </div>
  ));

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
        {([['trending', '🔥 Trending'], ['reddit', '📢 Reddit'], ['crypto', '🪙 Crypto']] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
              activeTab === id
                ? 'bg-gray-800 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="divide-y divide-gray-800">
        {loading ? skeleton : activeTab === 'trending' ? (
          data?.trending.length ? data.trending.map((item) => (
            <div key={item.symbol} className="px-4 py-2.5 flex items-center justify-between hover:bg-gray-800 transition-colors">
              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold w-5 text-right flex-shrink-0 ${RANK_COLORS[item.rank - 1] ?? 'text-gray-500'}`}>
                  #{item.rank}
                </span>
                <span className="text-green-400 font-bold text-sm">${item.symbol}</span>
              </div>
              <span className="text-xs bg-blue-900 text-blue-300 px-2 py-0.5 rounded-full">Yahoo</span>
            </div>
          )) : <p className="px-4 py-8 text-gray-500 text-xs text-center">No trending data</p>

        ) : activeTab === 'reddit' ? (
          data?.reddit.length ? data.reddit.map((item, i) => (
            <a
              key={i}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-4 py-2.5 hover:bg-gray-800 transition-colors"
            >
              <div className="flex items-start gap-2">
                <span className={`text-xs font-bold flex-shrink-0 mt-0.5 ${RANK_COLORS[i] ?? 'text-gray-500'}`}>
                  #{i + 1}
                </span>
                <p className="text-gray-200 text-xs leading-snug">
                  {item.title.length > 60 ? item.title.substring(0, 60) + '…' : item.title}
                </p>
              </div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap pl-5">
                {item.tickers.slice(0, 3).map(t => (
                  <span key={t} className="text-xs text-green-400 font-semibold">${t}</span>
                ))}
                <span className={`text-xs px-1.5 py-0.5 rounded ${SUBREDDIT_COLORS[item.subreddit] ?? 'bg-gray-700 text-gray-400'}`}>
                  {item.subreddit}
                </span>
                <span className="text-xs text-gray-500 ml-auto">▲ {item.score.toLocaleString()}</span>
              </div>
            </a>
          )) : <p className="px-4 py-8 text-gray-500 text-xs text-center">No Reddit data</p>

        ) : (
          data?.coins?.length ? data.coins.map((coin, i) => (
            <div
              key={coin.id}
              onClick={() => router.push(`/crypto/${coin.id}`)}
              className="px-4 py-2.5 flex items-center justify-between hover:bg-gray-800 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold w-5 text-right flex-shrink-0 ${RANK_COLORS[i] ?? 'text-gray-500'}`}>
                  #{i + 1}
                </span>
                <div>
                  <span className="text-green-400 font-bold text-sm uppercase">{coin.symbol}</span>
                  <p className="text-gray-500 text-xs">{coin.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold ${coin.price_change_percentage_24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {coin.price_change_percentage_24h >= 0 ? '▲' : '▼'} {Math.abs(coin.price_change_percentage_24h).toFixed(2)}%
                </span>
                <span className="text-xs bg-purple-900 text-purple-300 px-1.5 py-0.5 rounded">CG</span>
              </div>
            </div>
          )) : <p className="px-4 py-8 text-gray-500 text-xs text-center">No crypto data</p>
        )}
      </div>
    </div>
  );
}
