import { NextResponse } from 'next/server';

const KEY = process.env.FINNHUB_KEY;
const BASE = 'https://finnhub.io/api/v1';

const PENNY_STOCKS = [
  { symbol: 'SNDL', name: 'Sundial Growers' },
  { symbol: 'CLOV', name: 'Clover Health' },
  { symbol: 'BBIG', name: 'Vinco Ventures' },
  { symbol: 'EXPR', name: 'Express Inc' },
  { symbol: 'NAKD', name: 'Naked Brand Group' },
  { symbol: 'WKHS', name: 'Workhorse Group' },
  { symbol: 'NKLA', name: 'Nikola Corp' },
  { symbol: 'RIDE', name: 'Lordstown Motors' },
  { symbol: 'GOEV', name: 'Canoo Inc' },
  { symbol: 'ATER', name: 'Aterian Inc' },
  { symbol: 'SPRT', name: 'Support.com' },
  { symbol: 'PROG', name: 'Progenity Inc' },
  { symbol: 'BBBY', name: 'Bed Bath & Beyond' },
  { symbol: 'WISH', name: 'ContextLogic' },
  { symbol: 'CTRM', name: 'Castor Maritime' },
];

export async function GET() {
  if (!KEY) return NextResponse.json({ error: 'API key not configured' }, { status: 500 });

  const results = await Promise.allSettled(
    PENNY_STOCKS.map(async ({ symbol, name }) => {
      const res = await fetch(`${BASE}/quote?symbol=${symbol}&token=${KEY}`, { next: { revalidate: 60 } });
      const data = await res.json();
      return {
        symbol,
        name,
        c: data.c ?? 0,
        d: data.d ?? 0,
        dp: data.dp ?? 0,
        h: data.h ?? 0,
        l: data.l ?? 0,
        pc: data.pc ?? 0,
      };
    })
  );

  const quotes = results
    .filter(r => r.status === 'fulfilled')
    .map(r => (r as PromiseFulfilledResult<{ symbol: string; name: string; c: number; d: number; dp: number; h: number; l: number; pc: number }>).value);

  return NextResponse.json(quotes);
}
