'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Quote {
  symbol: string;
  c: number;
  dp: number;
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

function Change({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span className={`font-mono text-xs font-semibold ${up ? 'text-[#28d780]' : 'text-[#ff5a52]'}`}>
      {up ? '+' : ''}{value.toFixed(2)}%
    </span>
  );
}

export default function MarketPulseDashboard() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const symbols = [...INDEXES.map(item => item.symbol), ...MOVERS].join(',');
    Promise.allSettled([
      fetch(`/api/market?symbols=${symbols}`, { signal: controller.signal }).then(r => r.json()),
      fetch('/api/sectors', { signal: controller.signal }).then(r => r.json()),
    ]).then(([quoteResult, sectorResult]) => {
      if (quoteResult.status === 'fulfilled' && Array.isArray(quoteResult.value)) setQuotes(quoteResult.value);
      if (sectorResult.status === 'fulfilled' && Array.isArray(sectorResult.value)) setSectors(sectorResult.value);
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
    <section className="overflow-hidden rounded-xl border border-[#24343d] bg-[#0c171d] text-white">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
        <div className="flex items-baseline gap-3">
          <h2 className="text-2xl font-semibold tracking-[-0.03em]">Market Pulse</h2>
          <p className="hidden text-xs text-slate-400 sm:block">Live markets. Key trends. Biggest movers.</p>
        </div>
        <Link href="/markets" className="text-xs font-semibold text-[#5ca2ff] hover:text-white">Full markets dashboard →</Link>
      </div>

      {loading ? (
        <div className="grid min-h-56 place-items-center text-sm text-slate-400">Loading verified market data…</div>
      ) : quotes.length === 0 && sectors.length === 0 ? (
        <div className="grid min-h-44 place-items-center px-6 text-center text-sm text-slate-400">
          Market data is temporarily unavailable. No placeholder values are shown.
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1.35fr_.9fr_.75fr]">
          <div className="grid grid-cols-2 gap-3 border-white/10 p-4 sm:grid-cols-4 sm:p-5 lg:border-r">
            {INDEXES.map(index => {
              const quote = quoteFor(index.symbol);
              return (
                <Link key={index.symbol} href={`/stocks/${index.symbol}`} className="rounded-lg border border-white/10 bg-[#122129] p-3 transition-colors hover:border-[#5ca2ff]/60">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">{index.label}</p>
                  {quote?.c ? (
                    <>
                      <p className="mt-2 font-mono text-lg font-semibold text-white">{quote.c.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                      <div className="mt-2"><Change value={quote.dp ?? 0} /></div>
                    </>
                  ) : <p className="mt-5 text-xs text-slate-500">Unavailable</p>}
                </Link>
              );
            })}
          </div>

          <div className="border-t border-white/10 px-5 py-4 lg:border-r lg:border-t-0">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Sector performance</p>
            <div className="space-y-2">
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

          <div className="border-t border-white/10 px-5 py-4 lg:border-t-0">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Top movers</p>
            <div className="divide-y divide-white/10">
              {movers.map(quote => (
                <Link key={quote.symbol} href={`/stocks/${quote.symbol}`} className="flex items-center justify-between py-2.5 hover:text-[#5ca2ff]">
                  <span className="text-xs font-semibold">{quote.symbol}</span>
                  <span className="font-mono text-xs text-slate-300">${quote.c.toFixed(2)}</span>
                  <Change value={quote.dp ?? 0} />
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
