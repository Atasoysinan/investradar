'use client';

import { useEffect, useState } from 'react';
import StockNewsModal from './StockNewsModal';

interface Quote {
  symbol: string;
  c: number;
  d: number;
  dp: number;
}

const SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'JPM', 'SPY', 'QQQ', 'GLD'];

export default function TickerBar() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/market?symbols=${SYMBOLS.join(',')}`);
        const data = await res.json();
        if (Array.isArray(data)) setQuotes(data);
      } catch {
        // silently fail — ticker is non-critical
      }
    };
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (quotes.length === 0) return null;

  const items = [...quotes, ...quotes];

  return (
    <>
      <div className="bg-gray-900 border-b border-gray-800 overflow-hidden">
        <div className="ticker-track flex gap-10 py-2 px-4 whitespace-nowrap">
          {items.map((q, i) => (
            <button
              key={i}
              onClick={() => setSelected(q.symbol)}
              className="inline-flex items-center gap-2 text-xs hover:opacity-75 transition-opacity flex-shrink-0"
            >
              <span className="font-semibold text-white">{q.symbol}</span>
              <span className="text-gray-300">${q.c?.toFixed(2)}</span>
              <span className={q.dp >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {q.dp >= 0 ? '▲' : '▼'} {Math.abs(q.dp ?? 0).toFixed(2)}%
              </span>
            </button>
          ))}
        </div>
      </div>
      {selected && <StockNewsModal symbol={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
