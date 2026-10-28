import { checkDataRateLimit } from '@/lib/dataRateLimit';
import { NextResponse } from 'next/server';
import { fetchMarketQuote, marketQuoteList } from '@/lib/marketQuotes';

const KEY = process.env.FINNHUB_KEY;

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

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const limited = await checkDataRateLimit(request, 'market', 10);
  if (limited) return limited;
  if (!KEY) {
    return NextResponse.json(
      { error: 'Market data service is not configured.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const results = await Promise.allSettled(
    SECTORS.map(async ({ ticker, sectorName }) => {
      const data = await fetchMarketQuote(ticker, KEY, 300);
      return {
        ticker,
        sectorName,
        price: data.c,
        change: data.d,
        changePercent: data.dp,
      };
    })
  );

  return marketQuoteList(results);
}
