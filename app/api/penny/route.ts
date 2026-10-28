import { checkDataRateLimit } from '@/lib/dataRateLimit';
import { NextResponse } from 'next/server';
import { fetchMarketQuote, marketQuoteList } from '@/lib/marketQuotes';

const KEY = process.env.FINNHUB_KEY;

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

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const limited = await checkDataRateLimit(request, 'market', 15);
  if (limited) return limited;
  if (!KEY) return NextResponse.json({ error: 'Market data service is not configured.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });

  const results = await Promise.allSettled(
    PENNY_STOCKS.map(async ({ symbol, name }) => {
      const data = await fetchMarketQuote(symbol, KEY, 60);
      return {
        symbol,
        name,
        c: data.c,
        d: data.d,
        dp: data.dp,
        h: data.h,
        l: data.l,
        pc: data.pc,
      };
    })
  );

  return marketQuoteList(results);
}
