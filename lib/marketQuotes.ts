import { fetchJson } from '@/lib/dataRequest';
import { NextResponse } from 'next/server';

interface MarketQuote {
  c: number; d: number; dp: number; h: number; l: number; o: number; pc: number;
}

export async function fetchMarketQuote(symbol: string, key: string, revalidate: number, read = fetchJson): Promise<MarketQuote> {
  const value: unknown = await read(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(key)}`, {
    next: { revalidate },
  });
  if (!value || typeof value !== 'object' || 'error' in value) throw new Error('Invalid market quote');
  const data = value as Record<string, unknown>;
  const fields = ['c', 'd', 'dp', 'h', 'l', 'o', 'pc'] as const;
  if (!fields.every(field => typeof data[field] === 'number' && Number.isFinite(data[field]))
    || (data.c as number) <= 0 || ['h', 'l', 'o', 'pc'].some(field => (data[field] as number) < 0)) {
    throw new Error('Invalid market quote');
  }
  return { c: data.c as number, d: data.d as number, dp: data.dp as number,
    h: data.h as number, l: data.l as number, o: data.o as number, pc: data.pc as number };
}

export function marketQuoteList<T>(results: PromiseSettledResult<T>[]) {
  const quotes = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  if (results.length > 0 && quotes.length === 0) {
    return NextResponse.json({ error: 'Market data is temporarily unavailable. Please try again.' }, {
      status: 502, headers: { 'Cache-Control': 'no-store' },
    });
  }
  return NextResponse.json(quotes, {
    headers: quotes.length < results.length ? { 'X-Market-Data-Partial': 'true', 'Cache-Control': 'no-store' } : {},
  });
}
