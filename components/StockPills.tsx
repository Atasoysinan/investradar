'use client';

import { useEffect, useState } from 'react';
import { extractTickers } from '@/lib/stockMentions';
import StockNewsModal from './StockNewsModal';

interface QuoteData { symbol: string; c: number; dp: number; }

export default function StockPills({ headline, description }: { headline: string; description: string }) {
  const tickers = extractTickers(headline, description);
  const [quotes, setQuotes] = useState<QuoteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (tickers.length === 0) { setLoading(false); return; }
    fetch(`/api/market?type=multi-quote&symbols=${tickers.join(',')}`)
      .then(r => r.json())
      .then(data => { setQuotes(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [headline]);

  if (tickers.length === 0) return null;

  if (loading) return (
    <div className="flex gap-1.5 mt-2">
      {tickers.map(t => (
        <span key={t} className="bg-gray-100 text-gray-400 text-xs px-2 py-0.5 rounded-full animate-pulse">{t}</span>
      ))}
    </div>
  );

  return (
    <>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {quotes.map(q => {
          const up = q.dp > 0;
          const down = q.dp < 0;
          const pct = Math.abs(q.dp).toFixed(2);
          return (
            <button
              key={q.symbol}
              onClick={() => setSelected(q.symbol)}
              className={`text-xs font-semibold px-2 py-0.5 rounded-full border cursor-pointer hover:opacity-80 transition ${
                up ? 'bg-green-100 text-green-700 border-green-200' :
                down ? 'bg-red-100 text-red-700 border-red-200' :
                'bg-gray-100 text-gray-600 border-gray-200'
              }`}
            >
              {q.symbol} {up ? '▲' : down ? '▼' : '—'} {pct}%
            </button>
          );
        })}
      </div>
      {selected && <StockNewsModal symbol={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
