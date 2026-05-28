import { NextResponse } from 'next/server';

const FALLBACK = [
  { symbol: 'TSLA', name: 'Tesla', watchlist_count: 892000, sentiment: 'Bullish' },
  { symbol: 'AAPL', name: 'Apple', watchlist_count: 743000, sentiment: 'Bullish' },
  { symbol: 'NVDA', name: 'NVIDIA', watchlist_count: 621000, sentiment: 'Bullish' },
  { symbol: 'AMD', name: 'AMD', watchlist_count: 445000, sentiment: 'Bullish' },
  { symbol: 'SPY', name: 'S&P 500 ETF', watchlist_count: 398000, sentiment: null },
  { symbol: 'AMZN', name: 'Amazon', watchlist_count: 312000, sentiment: 'Bullish' },
  { symbol: 'META', name: 'Meta', watchlist_count: 287000, sentiment: 'Bullish' },
  { symbol: 'GOOGL', name: 'Alphabet', watchlist_count: 245000, sentiment: null },
];

interface StocktwitSymbol {
  symbol: string;
  title: string;
  watchlist_count: number;
  sentiment?: { basic: string };
}

export async function GET() {
  try {
    const res = await fetch('https://api.stocktwits.com/api/2/trending/symbols.json', {
      headers: { 'User-Agent': 'InvestRadar/1.0' },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Stocktwits returned ${res.status}`);
    const json = await res.json();
    const symbols: StocktwitSymbol[] = json?.symbols;
    if (!Array.isArray(symbols) || symbols.length === 0) throw new Error('No symbols');
    const data = symbols.slice(0, 8).map(s => ({
      symbol: s.symbol,
      name: s.title,
      watchlist_count: s.watchlist_count,
      sentiment: s.sentiment?.basic ?? null,
    }));
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(FALLBACK);
  }
}
