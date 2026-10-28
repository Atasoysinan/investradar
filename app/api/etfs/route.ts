import { ETF_INFO } from '@/lib/etfCatalog';
import { checkDataRateLimit } from '@/lib/dataRateLimit';
import { NextResponse } from 'next/server';
import { fetchMarketQuote, marketQuoteList } from '@/lib/marketQuotes';

const KEY = process.env.FINNHUB_KEY;


const ETF_SYMBOLS = Object.keys(ETF_INFO);

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const limited = await checkDataRateLimit(request, 'market', 30);
  if (limited) return limited;
  if (!KEY) return NextResponse.json({ error: 'Market data service is not configured.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });

  const results = await Promise.allSettled(
    ETF_SYMBOLS.map(async (symbol) => {
      const data = await fetchMarketQuote(symbol, KEY, 300);
      const info = ETF_INFO[symbol];
      return { symbol, name: info.name, category: info.category, c: data.c, d: data.d, dp: data.dp };
    })
  );

  return marketQuoteList(results);
}
