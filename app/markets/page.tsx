'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import StockNewsModal from '@/components/StockNewsModal';
import Header from '@/components/Header';

const WATCHLIST = [
  { symbol: 'SPY', name: 'S&P 500 ETF' },
  { symbol: 'QQQ', name: 'Nasdaq ETF' },
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'GOOGL', name: 'Alphabet' },
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'TSLA', name: 'Tesla' },
  { symbol: 'NVDA', name: 'NVIDIA' },
  { symbol: 'META', name: 'Meta' },
  { symbol: 'JPM', name: 'JPMorgan' },
  { symbol: 'GLD', name: 'Gold ETF' },
];

const TABS = ['Watchlist', 'S&P 500', 'NASDAQ', 'Penny Stocks', 'Crypto'];

interface Quote {
  symbol: string;
  c: number;
  d: number;
  dp: number;
  h: number;
  l: number;
  o: number;
  pc: number;
}

interface CoinData {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
  total_volume: number;
}

function formatCompact(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

function formatCoinPrice(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(6)}`;
}

export default function MarketsPage() {
  const router = useRouter();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState('Watchlist');
  const [indexData, setIndexData] = useState<Quote[]>([]);
  const [indexLoading, setIndexLoading] = useState(false);
  const [cryptoData, setCryptoData] = useState<CoinData[]>([]);
  const [cryptoLoading, setCryptoLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/market?symbols=${WATCHLIST.map(w => w.symbol).join(',')}`);
      const data = await res.json();
      setQuotes(Array.isArray(data) ? data : []);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (activeTab === 'Watchlist' || activeTab === 'Crypto') return;
    setIndexLoading(true);
    setIndexData([]);
    const tabParam = activeTab === 'S&P 500' ? 'sp500' : activeTab === 'NASDAQ' ? 'nasdaq' : 'penny';
    fetch(`/api/market?type=index-quotes&tab=${tabParam}`)
      .then(r => r.json())
      .then(data => { setIndexData(data); setIndexLoading(false); })
      .catch(() => setIndexLoading(false));
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'Crypto') return;
    setCryptoLoading(true);
    setCryptoData([]);
    fetch('/api/crypto')
      .then(r => r.json())
      .then(data => { setCryptoData(Array.isArray(data) ? data : []); setCryptoLoading(false); })
      .catch(() => setCryptoLoading(false));
  }, [activeTab]);

  const gainers = quotes.filter(q => q.dp > 0).sort((a, b) => b.dp - a.dp).slice(0, 3);
  const losers = quotes.filter(q => q.dp < 0).sort((a, b) => a.dp - b.dp).slice(0, 3);

  return (
    <div className="min-h-screen bg-[#f5f6f7] text-gray-900">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-sm text-white">IR</div>
              <span className="text-xl font-bold text-gray-900">InvestRadar</span>
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-500 font-medium">Markets</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={load}
              className="text-xs text-gray-600 border border-gray-300 bg-white hover:bg-gray-50 px-3 py-1 rounded font-medium transition-colors flex items-center gap-1"
            >
              ↻ Refresh
              {lastUpdated && <span className="text-gray-400 ml-1">· {lastUpdated.toLocaleTimeString()}</span>}
            </button>
            <Header />
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Top Movers */}
        {!loading && (gainers.length > 0 || losers.length > 0) && (
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
              <p className="text-xs font-bold uppercase text-green-700 tracking-wider mb-3">Top Gainers</p>
              <div className="space-y-2">
                {gainers.map(q => (
                  <button
                    key={q.symbol}
                    onClick={() => setSelected(q.symbol)}
                    className="w-full flex items-center justify-between hover:bg-gray-50 rounded px-2 py-1 transition-colors"
                  >
                    <span className="font-bold text-gray-900 text-sm">{q.symbol}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-700 text-sm">${q.c?.toFixed(2)}</span>
                      <span className="bg-green-100 text-green-700 font-semibold rounded px-2 py-0.5 text-xs">
                        ▲ {q.dp?.toFixed(2)}%
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
              <p className="text-xs font-bold uppercase text-red-700 tracking-wider mb-3">Top Losers</p>
              <div className="space-y-2">
                {losers.map(q => (
                  <button
                    key={q.symbol}
                    onClick={() => setSelected(q.symbol)}
                    className="w-full flex items-center justify-between hover:bg-gray-50 rounded px-2 py-1 transition-colors"
                  >
                    <span className="font-bold text-gray-900 text-sm">{q.symbol}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-700 text-sm">${q.c?.toFixed(2)}</span>
                      <span className="bg-red-100 text-red-700 font-semibold rounded px-2 py-0.5 text-xs">
                        ▼ {Math.abs(q.dp)?.toFixed(2)}%
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Table card with tabs */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-gray-200 px-4 overflow-x-auto">
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-3 px-4 text-sm transition-colors border-b-2 -mb-px whitespace-nowrap ${
                  activeTab === tab
                    ? 'border-gray-900 text-gray-900 font-semibold'
                    : 'border-transparent text-gray-500 hover:text-gray-700 font-medium'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Crypto tab */}
          {activeTab === 'Crypto' && (
            <div>
              {cryptoLoading ? (
                <div className="text-center py-16 text-gray-400">
                  <div className="text-lg font-medium mb-2">Loading crypto data…</div>
                  <div className="text-sm">Fetching from CoinGecko</div>
                </div>
              ) : cryptoData.length > 0 ? (
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 text-xs uppercase text-gray-500 font-semibold tracking-wider">
                      <th className="text-right py-3 px-4 w-10">#</th>
                      <th className="text-left py-3 px-4">Coin</th>
                      <th className="text-right py-3 px-4">Price</th>
                      <th className="text-right py-3 px-4">24h Change</th>
                      <th className="text-right py-3 px-4">Market Cap</th>
                      <th className="text-right py-3 px-4">Volume</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {cryptoData.map((coin, i) => (
                      <tr
                        key={coin.id}
                        onClick={() => router.push(`/crypto/${coin.id}`)}
                        className="hover:bg-blue-50 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4 text-right text-gray-400 text-sm font-medium">#{i + 1}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <img src={coin.image} alt={coin.name} className="w-6 h-6 rounded-full flex-shrink-0" />
                            <span className="font-bold text-gray-900 text-sm">{coin.name}</span>
                            <span className="text-xs text-gray-400 uppercase">{coin.symbol}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-gray-800 text-sm">
                          {formatCoinPrice(coin.current_price)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded font-semibold text-xs ${coin.price_change_percentage_24h >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {coin.price_change_percentage_24h >= 0 ? '▲' : '▼'} {Math.abs(coin.price_change_percentage_24h).toFixed(2)}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-gray-500 text-sm">{formatCompact(coin.market_cap)}</td>
                        <td className="py-3 px-4 text-right text-gray-500 text-sm">{formatCompact(coin.total_volume)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-16 text-gray-400 text-sm">Failed to load crypto data</div>
              )}
            </div>
          )}

          {/* S&P 500 / NASDAQ / Penny Stocks tabs */}
          {activeTab !== 'Watchlist' && activeTab !== 'Crypto' && (
            <div>
              {indexLoading ? (
                <div className="text-center py-16 text-gray-400">
                  <div className="text-lg font-medium mb-2">Loading {activeTab} data…</div>
                  <div className="text-sm">Fetching live quotes — this takes ~30 seconds due to API rate limits</div>
                </div>
              ) : indexData.length > 0 ? (
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 text-xs uppercase text-gray-500 font-semibold tracking-wider">
                      <th className="text-left py-3 px-4">Symbol</th>
                      <th className="text-right py-3 px-4">Price</th>
                      <th className="text-right py-3 px-4">Change</th>
                      <th className="text-right py-3 px-4">% Change</th>
                      <th className="text-right py-3 px-4">High</th>
                      <th className="text-right py-3 px-4">Low</th>
                      <th className="text-right py-3 px-4">News</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {indexData.filter(q => q.c > 0).map(quote => (
                      <tr
                        key={quote.symbol}
                        onClick={() => router.push(`/stocks/${quote.symbol}`)}
                        className="hover:bg-blue-50 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4 font-bold text-gray-900 text-sm">{quote.symbol}</td>
                        <td className="py-3 px-4 text-right text-gray-700">${quote.c.toFixed(2)}</td>
                        <td className={`py-3 px-4 text-right ${quote.d >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {quote.d >= 0 ? '+' : ''}{quote.d.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded font-semibold text-xs ${quote.dp >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {quote.dp >= 0 ? '▲' : '▼'} {Math.abs(quote.dp).toFixed(2)}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-gray-500 text-sm">${quote.h.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-gray-500 text-sm">${quote.l.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={e => { e.stopPropagation(); setSelected(quote.symbol); }}
                            className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            📰 View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-16 text-gray-400 text-sm">Click a tab to load live data</div>
              )}
            </div>
          )}

          {/* Watchlist tab */}
          {activeTab === 'Watchlist' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs uppercase text-gray-500 font-semibold tracking-wider border-b border-gray-200">
                    <th className="text-left px-4 py-3">Symbol</th>
                    <th className="text-right px-4 py-3">Price</th>
                    <th className="text-right px-4 py-3">Change</th>
                    <th className="text-right px-4 py-3">% Change</th>
                    <th className="text-right px-4 py-3">Open</th>
                    <th className="text-right px-4 py-3">High</th>
                    <th className="text-right px-4 py-3">Low</th>
                    <th className="text-right px-4 py-3">Prev Close</th>
                    <th className="text-center px-4 py-3">News</th>
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? [...Array(11)].map((_, i) => (
                        <tr key={i} className="border-b border-gray-100">
                          {[...Array(9)].map((_, j) => (
                            <td key={j} className="px-4 py-3">
                              <div className="h-4 bg-gray-100 rounded animate-pulse" />
                            </td>
                          ))}
                        </tr>
                      ))
                    : quotes.map(q => {
                        const info = WATCHLIST.find(w => w.symbol === q.symbol);
                        return (
                          <tr
                            key={q.symbol}
                            onClick={() => setSelected(q.symbol)}
                            className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                          >
                            <td className="px-4 py-3">
                              <div className="font-bold text-gray-900 text-sm">{q.symbol}</div>
                              <div className="text-xs text-gray-400">{info?.name}</div>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-gray-700">${q.c?.toFixed(2)}</td>
                            <td className={`px-4 py-3 text-right font-mono ${q.d >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                              {q.d >= 0 ? '+' : ''}{q.d?.toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={`inline-block font-semibold rounded px-2 py-0.5 text-xs ${
                                q.dp >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                              }`}>
                                {q.dp >= 0 ? '▲' : '▼'} {Math.abs(q.dp)?.toFixed(2)}%
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-gray-500">${q.o?.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right font-mono text-gray-500">${q.h?.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right font-mono text-gray-500">${q.l?.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right font-mono text-gray-500">${q.pc?.toFixed(2)}</td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={e => { e.stopPropagation(); setSelected(q.symbol); }}
                                className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                              >
                                📰 View
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selected && <StockNewsModal symbol={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
