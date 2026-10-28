import { checkDataRateLimit } from '@/lib/dataRateLimit';
import { createDataRequest } from '@/lib/dataRequest';
import { NextResponse } from 'next/server';
import { stocktwitsMessages, stocktwitsSymbols } from '@/lib/socialData';

function unavailable() {
  return NextResponse.json({ tickers: [], status: 'unavailable' }, {
    status: 502, headers: { 'Cache-Control': 'no-store' },
  });
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const limited = await checkDataRateLimit(request, 'market', 4);
  if (limited) return limited;
  const read = createDataRequest();
  try {
    const trendRes = await read('https://api.stocktwits.com/api/2/trending/symbols.json', {
      headers: { 'User-Agent': 'InvestRadar/1.0' }, next: { revalidate: 120 },
    });
    const symbols = stocktwitsSymbols(trendRes).slice(0, 3);
    const results = await Promise.allSettled(symbols.map(async item => {
      const response = await read(`https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(item.symbol)}.json`, {
        headers: { 'User-Agent': 'InvestRadar/1.0' }, next: { revalidate: 120 },
      });
      return { symbol: item.symbol, watchlist_count: item.watchlist_count, messages: stocktwitsMessages(response) };
    }));
    const failures = results.filter(result => result.status === 'rejected').length;
    if (results.length > 0 && failures === results.length) return unavailable();
    const tickers = results.flatMap(result => result.status === 'fulfilled' && result.value.messages.length ? [result.value] : []);
    return NextResponse.json({ tickers, status: failures ? 'partial' : 'ok' }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return unavailable();
  }
}
