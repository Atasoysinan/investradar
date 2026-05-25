import { NextRequest, NextResponse } from 'next/server';

const KEY = process.env.FINNHUB_KEY;
const BASE = 'https://finnhub.io/api/v1';

const DEFAULT_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'JPM', 'SPY', 'QQQ', 'GLD'];

const SP500_SYMBOLS = ['AAPL','MSFT','NVDA','AMZN','META','GOOGL','TSLA','BRK.B','JPM','V','MA','UNH','XOM','LLY','JNJ','PG','HD','MRK','ABBV','CVX','PEP','KO','WMT','BAC','CRM','ACN','MCD','NFLX','ADBE','TMO'];
const NASDAQ_SYMBOLS = ['QQQ','AAPL','MSFT','NVDA','AMZN','META','GOOGL','TSLA','AVGO','COST','NFLX','TMUS','AMD','QCOM','INTC','CSCO','INTU','AMAT','MU','LRCX','MRVL','PANW','KLAC','SNPS','CDNS','ADSK','MCHP','FTNT','ORLY','CTAS'];
const PENNY_SYMBOLS = ['SNDL','NAKD','CLOV','SPCE','NKLA','WKHS','SOLO','RIDE','GOEV','IDEX','GNUS','SHIP','TOPS','MRIN','ENRT','FCEL','CTRM','ILUS','TPVG','BIOR','ZOM','BNXG','PNTM','DPRO','HYMC','OZSC','ADMP','MBOT','SGBX','SEED'];

async function fetchWithDelay<T>(fns: (() => Promise<T>)[], delayMs = 60): Promise<T[]> {
  const results: T[] = [];
  for (const fn of fns) {
    results.push(await fn());
    await new Promise(res => setTimeout(res, delayMs));
  }
  return results;
}

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

    if (type === 'index-quotes') {
      const tab = searchParams.get('tab') || 'sp500';
      const symbolList = tab === 'nasdaq' ? NASDAQ_SYMBOLS : tab === 'penny' ? PENNY_SYMBOLS : SP500_SYMBOLS;

      const quotes = await fetchWithDelay(symbolList.map(sym => async () => {
        try {
          const res = await fetch(`${BASE}/quote?symbol=${sym}&token=${KEY}`);
          const data = await res.json();
          return { symbol: sym, c: data.c ?? 0, dp: data.dp ?? 0, h: data.h ?? 0, l: data.l ?? 0, o: data.o ?? 0, pc: data.pc ?? 0, d: data.d ?? 0 };
        } catch {
          return { symbol: sym, c: 0, dp: 0, h: 0, l: 0, o: 0, pc: 0, d: 0 };
        }
      }), 60);

      return NextResponse.json(quotes);
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
    const quotes = await fetchWithDelay(symbols.map(sym => async () => {
      const res = await fetch(`${BASE}/quote?symbol=${sym}&token=${KEY}`);
      const data = await res.json();
      return { symbol: sym, c: data.c ?? 0, dp: data.dp ?? 0, h: data.h ?? 0, l: data.l ?? 0, o: data.o ?? 0, pc: data.pc ?? 0, d: data.d ?? 0 };
    }));
    return NextResponse.json(quotes);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch market data' }, { status: 500 });
  }
}
