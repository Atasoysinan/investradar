import { checkDataRateLimit } from '@/lib/dataRateLimit';
import { fetchJson } from '@/lib/dataRequest';
import { NextResponse } from 'next/server';
import { stocktwitsSymbols } from '@/lib/socialData';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const limited = await checkDataRateLimit(request, 'market', 1);
  if (limited) return limited;
  try {
    const data = await fetchJson('https://api.stocktwits.com/api/2/trending/symbols.json', {
      headers: { 'User-Agent': 'InvestRadar/1.0' }, cache: 'no-store',
    });
    return NextResponse.json(stocktwitsSymbols(data).slice(0, 8));
  } catch {
    return NextResponse.json({ error: 'Stocktwits data is temporarily unavailable.' }, {
      status: 502, headers: { 'Cache-Control': 'no-store' },
    });
  }
}
