import { checkDataRateLimit } from '@/lib/dataRateLimit';
import { fetchJson } from '@/lib/dataRequest';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const limited = await checkDataRateLimit(request, 'market', 1);
  if (limited) return limited;
  try {
    const data = await fetchJson(
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=false',
      {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 60 },
      }
    );
    if (!Array.isArray(data)) throw new Error('Invalid crypto response');
    const coins = data.flatMap(value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
      const row = value as Record<string, unknown>;
      if (!['id', 'symbol', 'name', 'image'].every(field => typeof row[field] === 'string' && row[field].trim())
        || !['current_price', 'market_cap', 'total_volume'].every(field => typeof row[field] === 'number'
          && Number.isFinite(row[field]) && row[field] >= 0)
        || (row.current_price as number) <= 0) return [];
      const change = row.price_change_percentage_24h;
      if (change != null && (typeof change !== 'number' || !Number.isFinite(change))) return [];
      try {
        if (!['http:', 'https:'].includes(new URL(row.image as string).protocol)) return [];
      } catch { return []; }
      return [{ id: row.id, symbol: row.symbol, name: row.name, image: row.image,
        current_price: row.current_price, price_change_percentage_24h: change ?? null,
        market_cap: row.market_cap, total_volume: row.total_volume }];
    });
    if (data.length > 0 && coins.length === 0) throw new Error('No valid crypto rows');
    return NextResponse.json(coins, { headers: coins.length < data.length
      ? { 'X-Market-Data-Partial': 'true', 'Cache-Control': 'no-store' } : {} });
  } catch {
    return NextResponse.json({ error: 'Crypto data is temporarily unavailable. Please try again.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
