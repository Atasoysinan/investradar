'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchData } from '@/lib/dataRequest';

interface Quote {
  symbol: string;
  c: number;
  dp: number | null;
}

interface Sector {
  ticker: string;
  sectorName: string;
  price: number;
  changePercent: number;
}

const INDEXES = [
  { symbol: 'SPY', label: 'S&P 500' },
  { symbol: 'QQQ', label: 'NASDAQ' },
  { symbol: 'DIA', label: 'DOW' },
  { symbol: 'IWM', label: 'Russell 2000' },
];

const MOVERS = ['NVDA', 'MSFT', 'AAPL', 'AMD', 'AMZN'];

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function quoteRows(value: unknown): Quote[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(row => {
    if (!row || typeof row !== 'object' || typeof row.symbol !== 'string'
      || !row.symbol.trim() || !finite(row.c) || row.c <= 0) return [];
    return [{ symbol: row.symbol, c: row.c, dp: finite(row.dp) ? row.dp : null }];
  });
}

function sectorRows(value: unknown): Sector[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is Sector => row && typeof row === 'object'
    && typeof row.ticker === 'string' && row.ticker.trim()
    && typeof row.sectorName === 'string' && row.sectorName.trim() && finite(row.changePercent));
}

function Change({ value }: { value: number | null }) {
  const valid = finite(value);
  return (
    <span className={`font-mono text-[11px] font-normal ${valid && value > 0 ? 'text-[#55de97]' : valid && value < 0 ? 'text-[#ff6b63]' : 'text-slate-400'}`}>
      {valid ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '—'}
    </span>
  );
}

export default function MarketPulseDashboard() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [partial, setPartial] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const symbols = [...INDEXES.map(item => item.symbol), ...MOVERS].join(',');
    Promise.allSettled([
      fetchData(`/api/market?symbols=${symbols}`, { signal: controller.signal }, 12000),
      fetchData('/api/sectors', { signal: controller.signal }, 12000),
    ]).then(([quoteResult, sectorResult]) => {
      if (controller.signal.aborted) return;
      const quotes = quoteRows(quoteResult.status === 'fulfilled' ? quoteResult.value.data : null);
      const sectors = sectorRows(sectorResult.status === 'fulfilled' ? sectorResult.value.data : null);
      setQuotes(quotes); setSectors(sectors);
      setPartial(quoteResult.status === 'rejected' || sectorResult.status === 'rejected'
        || (quoteResult.status === 'fulfilled' && (!Array.isArray(quoteResult.value.data)
          || quotes.length < quoteResult.value.data.length || quoteResult.value.headers.get('X-Market-Data-Partial') === 'true'))
        || (sectorResult.status === 'fulfilled' && (!Array.isArray(sectorResult.value.data)
          || sectors.length < sectorResult.value.data.length || sectorResult.value.headers.get('X-Market-Data-Partial') === 'true')));
      setLoading(false);
    });
    return () => controller.abort();
  }, []);

  const quoteFor = (symbol: string) => quotes.find(item => item.symbol === symbol);
  const movers = MOVERS.map(symbol => quoteFor(symbol)).filter((item): item is Quote => Boolean(item?.c));
  const visibleSectors = [...sectors]
    .filter(item => Number.isFinite(item.changePercent))
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, 7);
  const maxSectorMove = Math.max(1, ...visibleSectors.map(item => Math.abs(item.changePercent)));

  return (
    <section className="overflow-hidden rounded-xl bg-[#171721] text-[#ededf3]">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10 px-5 py-3 sm:px-6">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[22px] font-normal tracking-[-0.025em]">Market Pulse</h2>
          <p className="hidden text-[11px] text-[#c3c3cc] sm:block">Live markets. Key trends. Biggest movers.</p>
        </div>
        <Link href="/markets" className="text-[11px] font-normal text-[#9eabff] hover:text-white">Full markets dashboard →</Link>
      </div>

      {partial && !loading && (quotes.length > 0 || sectors.length > 0) && <p role="status" className="px-5 py-2 text-xs text-slate-400">Some market data is unavailable. Showing available data.</p>}

      {loading ? (
        <div className="grid min-h-56 place-items-center text-sm text-slate-400">Loading verified market data…</div>
      ) : quotes.length === 0 && sectors.length === 0 ? (
        <div className="grid min-h-44 place-items-center px-6 text-center text-sm text-slate-400">
          Market data is temporarily unavailable. No placeholder values are shown.
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1.35fr_.9fr_.75fr]">
          <div className="grid grid-cols-2 gap-2 border-white/10 p-3 sm:grid-cols-4 sm:p-4 lg:border-r">
            {INDEXES.map(index => {
              const quote = quoteFor(index.symbol);
              return (
                <Link key={index.symbol} href={`/stocks/${index.symbol}`} className="rounded-xl bg-[#1e1e2a] p-3 transition-colors hover:bg-[#272735]">
                  <p className="text-[9px] font-normal uppercase tracking-[0.08em] text-[#c3c3cc]">{index.label}</p>
                  {quote?.c ? (
                    <>
                      <p className="mt-1.5 font-mono text-[17px] font-normal text-white">{quote.c.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                      <div className="mt-1"><Change value={quote.dp} /></div>
                    </>
                  ) : <p className="mt-5 text-xs text-slate-500">Unavailable</p>}
                </Link>
              );
            })}
          </div>

          <div className="border-t border-white/10 px-4 py-3 lg:border-r lg:border-t-0">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Sector performance</p>
            <div className="space-y-1.5">
              {visibleSectors.map(sector => (
                <div key={sector.ticker} className="grid grid-cols-[112px_1fr_54px] items-center gap-2 text-[11px]">
                  <span className="truncate text-slate-200">{sector.sectorName}</span>
                  <span className="h-2 overflow-hidden rounded-sm bg-white/5">
                    <span
                      className={`block h-full ${sector.changePercent >= 0 ? 'bg-[#28d780]' : 'bg-[#ff5a52]'}`}
                      style={{ width: `${Math.max(6, Math.abs(sector.changePercent) / maxSectorMove * 100)}%` }}
                    />
                  </span>
                  <Change value={sector.changePercent} />
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-white/10 px-4 py-3 lg:border-t-0">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Top movers</p>
            <div className="divide-y divide-white/10">
              {movers.map(quote => (
                <Link key={quote.symbol} href={`/stocks/${quote.symbol}`} className="flex items-center justify-between py-2 hover:text-[#9eabff]">
                  <span className="text-xs font-normal">{quote.symbol}</span>
                  <span className="font-mono text-xs text-slate-300">${quote.c.toFixed(2)}</span>
                  <Change value={quote.dp} />
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
