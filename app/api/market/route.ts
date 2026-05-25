import { NextRequest, NextResponse } from 'next/server';

const KEY = process.env.FINNHUB_KEY;
const BASE = 'https://finnhub.io/api/v1';

const DEFAULT_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'JPM', 'SPY', 'QQQ', 'GLD'];

export async function GET(request: NextRequest) {
  if (!KEY) return NextResponse.json({ error: 'API key not configured' }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const type = searchParams.get('type');
  const symbolsParam = searchParams.get('symbols');

  try {
    if (type === 'multi-quote') {
      const symbols = (searchParams.get('symbols') || '').split(',').filter(Boolean).slice(0, 5);
      const quotes = await Promise.allSettled(
        symbols.map(async (sym) => {
          const res = await fetch(`${BASE}/quote?symbol=${sym}&token=${KEY}`);
          const data = await res.json();
          return { symbol: sym, c: data.c ?? 0, dp: data.dp ?? 0 };
        })
      );
      const results = quotes
        .filter((r) => r.status === 'fulfilled')
        .map((r) => (r as PromiseFulfilledResult<{ symbol: string; c: number; dp: number }>).value);
      return NextResponse.json(results);
    }

    if (symbol && type === 'news') {
      const to = new Date().toISOString().split('T')[0];
      const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const res = await fetch(`${BASE}/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${KEY}`);
      const data = await res.json();
      return NextResponse.json(Array.isArray(data) ? data.slice(0, 10) : []);
    }

    if (symbol) {
      const [quoteRes, profileRes] = await Promise.all([
        fetch(`${BASE}/quote?symbol=${symbol}&token=${KEY}`),
        fetch(`${BASE}/stock/profile2?symbol=${symbol}&token=${KEY}`),
      ]);
      const [quote, profile] = await Promise.all([quoteRes.json(), profileRes.json()]);
      return NextResponse.json({ quote, profile });
    }

    const symbols = symbolsParam ? symbolsParam.split(',') : DEFAULT_SYMBOLS;
    const quotes = await Promise.all(
      symbols.map(async (sym) => {
        const res = await fetch(`${BASE}/quote?symbol=${sym}&token=${KEY}`);
        const data = await res.json();
        return { symbol: sym, ...data };
      })
    );
    return NextResponse.json(quotes);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch market data' }, { status: 500 });
  }
}
