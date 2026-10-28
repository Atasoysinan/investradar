'use client';

import { ETF_CATEGORIES } from '@/lib/etfCatalog';
import { fetchData } from '@/lib/dataRequest';

import Image from 'next/image';
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

const TABS = ['Watchlist', 'S&P 500', 'NASDAQ', 'Penny Stocks', 'ETFs', 'Crypto'];

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
  price_change_percentage_24h: number | null;
  market_cap: number;
  total_volume: number;
}

interface PennyStock {
  symbol: string;
  name: string;
  c: number;
  d: number;
  dp: number;
  h: number;
  l: number;
  pc: number;
}

interface EtfQuote {
  symbol: string;
  name: string;
  category: string;
  c: number;
  d: number;
  dp: number;
}

function validMarketRows(tab: string, value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const numericFields = tab === 'Crypto'
    ? ['current_price', 'market_cap', 'total_volume']
    : tab === 'ETFs' ? ['c', 'd', 'dp']
    : tab === 'Penny Stocks' ? ['c', 'd', 'dp', 'h', 'l', 'pc']
    : ['c', 'd', 'dp', 'h', 'l', 'o', 'pc'];
  const textFields = tab === 'Crypto' ? ['id', 'symbol', 'name', 'image']
    : tab === 'ETFs' ? ['symbol', 'name', 'category']
    : tab === 'Penny Stocks' ? ['symbol', 'name'] : ['symbol'];
  return value.every(row => {
    if (!row || typeof row !== 'object') return false;
    if (!textFields.every(field => typeof row[field] === 'string' && row[field].trim().length > 0)) return false;
    if (!numericFields.every(field => typeof row[field] === 'number' && Number.isFinite(row[field]))) return false;
    if (tab === 'Crypto') {
      const change = row.price_change_percentage_24h;
      if (change !== null && (typeof change !== 'number' || !Number.isFinite(change))) return false;
      try {
        if (!['https:', 'http:'].includes(new URL(row.image).protocol)) return false;
      } catch { return false; }
    }
    return true;
  });
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

const IndexSkeleton = () => (
  <div>
    <div className="flex items-center gap-2 justify-center py-3 text-xs text-gray-400 border-b border-gray-100">
      <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
      Loading live data…
    </div>
    <div className="w-full overflow-x-auto" role="region" aria-label="Market data table" tabIndex={0}>
      <table className="w-full">
        <tbody className="divide-y divide-gray-100">
          {[...Array(8)].map((_, i) => (
            <tr key={i} className="animate-pulse">
              <td className="py-3 px-4"><div className="h-4 bg-gray-200 rounded w-16"/></td>
              <td className="py-3 px-4"><div className="h-4 bg-gray-200 rounded w-20 ml-auto"/></td>
              <td className="py-3 px-4"><div className="h-4 bg-gray-200 rounded w-12 ml-auto"/></td>
              <td className="py-3 px-4"><div className="h-5 bg-gray-200 rounded w-16 ml-auto"/></td>
              <td className="py-3 px-4"><div className="h-4 bg-gray-200 rounded w-14 ml-auto"/></td>
              <td className="py-3 px-4"><div className="h-4 bg-gray-200 rounded w-14 ml-auto"/></td>
              <td className="py-3 px-4"><div className="h-4 bg-gray-200 rounded w-10 ml-auto"/></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export default function MarketsPage() {
  const router = useRouter();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Record<string, Date>>({});
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [refreshError, setRefreshError] = useState('');
  const [activeTab, setActiveTab] = useState('Watchlist');
  const [indexByTab, setIndexByTab] = useState<Record<string, Quote[]>>({});
  const [indexLoading, setIndexLoading] = useState(false);
  const [cryptoData, setCryptoData] = useState<CoinData[]>([]);
  const [cryptoLoading, setCryptoLoading] = useState(false);
  const [pennyData, setPennyData] = useState<PennyStock[]>([]);
  const [pennyLoading, setPennyLoading] = useState(false);
  const [etfData, setEtfData] = useState<EtfQuote[]>([]);
  const [etfLoading, setEtfLoading] = useState(false);
  const [etfFilter, setEtfFilter] = useState('All');

  const indexData = indexByTab[activeTab] ?? [];
  const lastUpdated = updatedAt[activeTab];
  const refreshing = activeTab === 'Watchlist' ? loading
    : activeTab === 'Crypto' ? cryptoLoading
    : activeTab === 'Penny Stocks' ? pennyLoading
    : activeTab === 'ETFs' ? etfLoading : indexLoading;

  function beginLoading(tab: string) {
    setRefreshError('');
    if (tab === 'Watchlist') setLoading(true);
    else if (tab === 'Crypto') setCryptoLoading(true);
    else if (tab === 'Penny Stocks') setPennyLoading(true);
    else if (tab === 'ETFs') setEtfLoading(true);
    else setIndexLoading(true);
  }

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const endpoints: Record<string, string> = {
      Watchlist: `/api/market?symbols=${WATCHLIST.map(w => w.symbol).join(',')}`,
      'S&P 500': '/api/market?type=index-quotes&tab=sp500',
      NASDAQ: '/api/market?type=index-quotes&tab=nasdaq',
      Crypto: '/api/crypto',
      'Penny Stocks': '/api/penny',
      ETFs: '/api/etfs',
    };
    async function load() {
      try {
        const { data, headers } = await fetchData(endpoints[activeTab], { signal: controller.signal }, 12000);
        if (!validMarketRows(activeTab, data)) throw new Error('Invalid market response');
        if (!active) return;
        if (activeTab === 'Watchlist') setQuotes(data);
        else if (activeTab === 'Crypto') setCryptoData(data);
        else if (activeTab === 'Penny Stocks') setPennyData(data);
        else if (activeTab === 'ETFs') setEtfData(data);
        else setIndexByTab(previous => ({ ...previous, [activeTab]: data }));
        setUpdatedAt(previous => ({ ...previous, [activeTab]: new Date() }));
        if (headers.get('X-Market-Data-Partial') === 'true') {
          setRefreshError('Some market data is unavailable. Showing available quotes.');
        }
      } catch {
        if (active) setRefreshError('Unable to refresh market data. Please try again.');
      } finally {
        if (active) {
          if (activeTab === 'Watchlist') setLoading(false);
          else if (activeTab === 'Crypto') setCryptoLoading(false);
          else if (activeTab === 'Penny Stocks') setPennyLoading(false);
          else if (activeTab === 'ETFs') setEtfLoading(false);
          else setIndexLoading(false);
        }
      }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [activeTab, refreshVersion]);

  const gainers = quotes.filter(q => q.dp > 0).sort((a, b) => b.dp - a.dp).slice(0, 3);
  const losers = quotes.filter(q => q.dp < 0).sort((a, b) => a.dp - b.dp).slice(0, 3);

  return (
    <div className="min-h-screen bg-[#f5f6f7] text-gray-900">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-sm text-white">IR</div>
              <span className="text-xl font-bold text-gray-900">InvestRadar</span>
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-500 font-medium">Markets</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
            <button
              onClick={() => { beginLoading(activeTab); setRefreshVersion(version => version + 1); }}
              disabled={refreshing}
              aria-busy={refreshing}
              className="text-xs text-gray-600 border border-gray-300 bg-white hover:bg-gray-50 px-3 py-1 rounded font-medium transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              ↻ Refresh
              {lastUpdated && <span className="text-gray-400 ml-1">· {lastUpdated.toLocaleTimeString()}</span>}
            </button>
            <Header />
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {refreshError && <p role="alert" className="mb-4 text-sm text-red-700">{refreshError}</p>}
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
                onClick={() => {
                  if (tab === activeTab) return;
                  beginLoading(tab);
                  setActiveTab(tab);
                }}
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
                <div className="w-full overflow-x-auto" role="region" aria-label="Market data table" tabIndex={0}>
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
                              <Image unoptimized width={24} height={24} src={coin.image} alt={coin.name} className="w-6 h-6 rounded-full flex-shrink-0" />
                              <span className="font-bold text-gray-900 text-sm">{coin.name}</span>
                              <span className="text-xs text-gray-400 uppercase">{coin.symbol}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-gray-800 text-sm">
                            {formatCoinPrice(coin.current_price)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {coin.price_change_percentage_24h === null ? (
                              <span className="text-gray-400 text-xs" aria-label="24-hour change unavailable">—</span>
                            ) : (
                            <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded font-semibold text-xs ${coin.price_change_percentage_24h >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {coin.price_change_percentage_24h >= 0 ? '▲' : '▼'} {Math.abs(coin.price_change_percentage_24h).toFixed(2)}%
                            </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-500 text-sm">{formatCompact(coin.market_cap)}</td>
                          <td className="py-3 px-4 text-right text-gray-500 text-sm">{formatCompact(coin.total_volume)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-16 text-gray-400 text-sm">Failed to load crypto data</div>
              )}
            </div>
          )}

          {/* S&P 500 / NASDAQ tabs */}
          {(activeTab === 'S&P 500' || activeTab === 'NASDAQ') && (
            <div>
              {indexLoading ? (
                <IndexSkeleton />
              ) : indexData.length > 0 ? (
                <div className="w-full overflow-x-auto" role="region" aria-label="Market data table" tabIndex={0}>
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
                </div>
              ) : (
                <div className="text-center py-16 text-gray-400 text-sm">Click a tab to load live data</div>
              )}
            </div>
          )}

          {/* Penny Stocks tab */}
          {activeTab === 'Penny Stocks' && (
            <div>
              {pennyLoading ? (
                <IndexSkeleton />
              ) : pennyData.length > 0 ? (
                <div className="w-full overflow-x-auto" role="region" aria-label="Market data table" tabIndex={0}>
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 text-xs uppercase text-gray-500 font-semibold tracking-wider">
                        <th className="text-left py-3 px-4">Symbol</th>
                        <th className="text-left py-3 px-4">Company</th>
                        <th className="text-right py-3 px-4">Price</th>
                        <th className="text-right py-3 px-4">Change</th>
                        <th className="text-right py-3 px-4">% Change</th>
                        <th className="text-right py-3 px-4">High</th>
                        <th className="text-right py-3 px-4">Low</th>
                        <th className="text-right py-3 px-4">Prev Close</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {pennyData.filter(q => q.c > 0).map(quote => (
                        <tr
                          key={quote.symbol}
                          onClick={() => router.push(`/stocks/${quote.symbol}`)}
                          className="hover:bg-blue-50 cursor-pointer transition-colors"
                        >
                          <td className="py-3 px-4 font-bold text-gray-900 text-sm">{quote.symbol}</td>
                          <td className="py-3 px-4 text-gray-500 text-sm">{quote.name}</td>
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
                          <td className="py-3 px-4 text-right text-gray-500 text-sm">${quote.pc.toFixed(2)}</td>
                        </tr>
                      ))}
                      {pennyData.filter(q => q.c === 0).length === pennyData.length && (
                        <tr>
                          <td colSpan={8} className="text-center py-16 text-gray-400 text-sm">
                            Market closed or data unavailable
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-16 text-gray-400 text-sm">Failed to load penny stock data</div>
              )}
            </div>
          )}

          {/* ETFs tab */}
          {activeTab === 'ETFs' && (
            <div>
              <div className="flex gap-2 px-4 py-3 border-b border-gray-100 overflow-x-auto">
                {ETF_CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setEtfFilter(cat)}
                    className={`px-3 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                      etfFilter === cat
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              {etfLoading ? (
                <IndexSkeleton />
              ) : etfData.length > 0 ? (
                <div className="w-full overflow-x-auto" role="region" aria-label="Market data table" tabIndex={0}>
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 text-xs uppercase text-gray-500 font-semibold tracking-wider">
                        <th className="text-left py-3 px-4">Symbol</th>
                        <th className="text-left py-3 px-4">Name</th>
                        <th className="text-left py-3 px-4">Category</th>
                        <th className="text-right py-3 px-4">Price</th>
                        <th className="text-right py-3 px-4">Change</th>
                        <th className="text-right py-3 px-4">% Change</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {etfData
                        .filter(etf => etfFilter === 'All' || etf.category === etfFilter)
                        .map(etf => (
                          <tr
                            key={etf.symbol}
                            onClick={() => router.push(`/stocks/${etf.symbol}`)}
                            className="hover:bg-blue-50 cursor-pointer transition-colors"
                          >
                            <td className="py-3 px-4 font-bold text-gray-900 text-sm">{etf.symbol}</td>
                            <td className="py-3 px-4 text-gray-700 text-sm">{etf.name}</td>
                            <td className="py-3 px-4">
                              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">{etf.category}</span>
                            </td>
                            <td className="py-3 px-4 text-right text-gray-700">${etf.c.toFixed(2)}</td>
                            <td className={`py-3 px-4 text-right ${etf.d >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {etf.d >= 0 ? '+' : ''}{etf.d.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded font-semibold text-xs ${etf.dp >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {etf.dp >= 0 ? '▲' : '▼'} {Math.abs(etf.dp).toFixed(2)}%
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-16 text-gray-400 text-sm">Failed to load ETF data</div>
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
