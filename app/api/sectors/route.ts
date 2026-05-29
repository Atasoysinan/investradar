import { NextResponse } from 'next/server';

const KEY = process.env.FINNHUB_KEY;
const BASE = 'https://finnhub.io/api/v1';

const SECTORS = [
  { ticker: 'XLK',  sectorName: 'Technology' },
  { ticker: 'XLE',  sectorName: 'Energy' },
  { ticker: 'XLV',  sectorName: 'Healthcare' },
  { ticker: 'XLF',  sectorName: 'Financials' },
  { ticker: 'XLY',  sectorName: 'Consumer Disc.' },
  { ticker: 'XLI',  sectorName: 'Industrials' },
  { ticker: 'XLRE', sectorName: 'Real Estate' },
  { ticker: 'XLU',  sectorName: 'Utilities' },
  { ticker: 'XLB',  sectorName: 'Materials' },
  { ticker: 'XLC',  sectorName: 'Communication' },
];

export async function GET() {
  if (!KEY) return NextResponse.json({ error: 'API key not configured' }, { status: 500 });

  const results = await Promise.allSettled(
    SECTORS.map(async ({ ticker, sectorName }) => {
      const res = await fetch(`${BASE}/quote?symbol=${ticker}&token=${KEY}`, { next: { revalidate: 300 } });
      const data = await res.json();
      return {
        ticker,
        sectorName,
        price: data.c ?? 0,
        change: data.d ?? 0,
        changePercent: data.dp ?? 0,
      };
    })
  );

  const sectors = results
    .filter(r => r.status === 'fulfilled')
    .map(r => (r as PromiseFulfilledResult<{ ticker: string; sectorName: string; price: number; change: number; changePercent: number }>).value);

  return NextResponse.json(sectors);
}
