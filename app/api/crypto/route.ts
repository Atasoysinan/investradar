import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=false',
      {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 60 },
      }
    );
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const data = await res.json();
    return NextResponse.json(
      data.map((c: {
        id: string; symbol: string; name: string; image: string;
        current_price: number; price_change_percentage_24h: number;
        market_cap: number; total_volume: number;
      }) => ({
        id: c.id,
        symbol: c.symbol,
        name: c.name,
        image: c.image,
        current_price: c.current_price,
        price_change_percentage_24h: c.price_change_percentage_24h,
        market_cap: c.market_cap,
        total_volume: c.total_volume,
      }))
    );
  } catch {
    return NextResponse.json({ error: 'Failed to fetch crypto data' }, { status: 500 });
  }
}
