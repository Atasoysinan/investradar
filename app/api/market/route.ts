import { checkDataRateLimit } from '@/lib/dataRateLimit';
import { createDataRequest } from '@/lib/dataRequest';
import { NextRequest, NextResponse } from 'next/server';
import { fetchMarketQuote, marketQuoteList } from '@/lib/marketQuotes';

const KEY = process.env.FINNHUB_KEY;
const BASE = 'https://finnhub.io/api/v1';

const DEFAULT_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'JPM', 'SPY', 'QQQ', 'GLD'];

const SP500_SYMBOLS = ['AAPL','MSFT','NVDA','AMZN','META','GOOGL','TSLA','BRK.B','JPM','V','MA','UNH','XOM','LLY','JNJ','PG','HD','MRK','ABBV','CVX','PEP','KO','WMT','BAC','CRM','ACN','MCD','NFLX','ADBE','TMO'];
const NASDAQ_SYMBOLS = ['QQQ','AAPL','MSFT','NVDA','AMZN','META','GOOGL','TSLA','AVGO','COST','NFLX','TMUS','AMD','QCOM','INTC','CSCO','INTU','AMAT','MU','LRCX','MRVL','PANW','KLAC','SNPS','CDNS','ADSK','MCHP','FTNT','ORLY','CTAS'];
const PENNY_SYMBOLS = ['SNDL','NAKD','CLOV','SPCE','NKLA','WKHS','SOLO','RIDE','GOEV','IDEX','GNUS','SHIP','TOPS','MRIN','ENRT','FCEL','CTRM','ILUS','TPVG','BIOR','ZOM','BNXG','PNTM','DPRO','HYMC','OZSC','ADMP','MBOT','SGBX','SEED'];

async function fetchWithDelay<T>(fns: (() => Promise<T>)[], delayMs = 60, deadline = Date.now() + 8000): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  for (const fn of fns) {
    if (Date.now() >= deadline) { results.push({ status: 'rejected', reason: new Error('Market request timed out') }); continue; }
    try { results.push({ status: 'fulfilled', value: await fn() }); }
    catch (reason) { results.push({ status: 'rejected', reason }); }
    await new Promise(res => setTimeout(res, Math.max(0, Math.min(delayMs, deadline - Date.now()))));
  }
  return results;
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const type = searchParams.get('type');
  const symbolsParam = searchParams.get('symbols');
  const invalid = () => NextResponse.json({ error: 'Invalid symbols. Use at most 30 symbols (5 for multi-quote), each up to 15 characters.' }, {
    status: 400, headers: { 'Cache-Control': 'no-store' },
  });
  const validSymbol = (value: string) => /^[A-Z0-9^][A-Z0-9.^:_-]{0,14}$/i.test(value);
  if (searchParams.getAll('symbols').length > 1 || searchParams.getAll('symbol').length > 1) return invalid();
  if (symbol !== null && (!validSymbol(symbol) || symbolsParam !== null || type === 'multi-quote' || type === 'index-quotes')) return invalid();
  let requestedSymbols: string[] | undefined;
  if (symbolsParam !== null) {
    if (!symbolsParam || symbolsParam.length > 479) return invalid();
    const entries = symbolsParam.split(',').map(value => value.trim());
    if (entries.length > (type === 'multi-quote' ? 5 : 30) || !entries.every(validSymbol)) return invalid();
    requestedSymbols = [...new Set(entries.map(value => value.toUpperCase()))];
  }
  if (type === 'multi-quote' && !requestedSymbols) return invalid();
  if (!KEY) {
    return NextResponse.json({ error: 'Market data service is not configured.' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
  }
  const cost = symbol ? (type === 'news' ? 1 : 2) : type === 'index-quotes' ? 30 : requestedSymbols?.length ?? DEFAULT_SYMBOLS.length;
  const limited = await checkDataRateLimit(request, symbol && type === 'news' ? 'news' : 'market', cost);
  if (limited) return limited;
  const read = createDataRequest();
  try {
    if (type === 'multi-quote') {
      const symbols = requestedSymbols!;
      const quotes = await Promise.allSettled(symbols.map(async sym => {
        const data = await fetchMarketQuote(sym, KEY, 60, read);
        return { symbol: sym, c: data.c, dp: data.dp };
      }));
      return marketQuoteList(quotes);
    }
    if (type === 'index-quotes') {
      const tab = searchParams.get('tab') || 'sp500';
      const symbols = tab === 'nasdaq' ? NASDAQ_SYMBOLS : tab === 'penny' ? PENNY_SYMBOLS : SP500_SYMBOLS;
      return marketQuoteList(await fetchWithDelay(symbols.map(sym => async () => ({
        symbol: sym, ...await fetchMarketQuote(sym, KEY, 60, read),
      }))));
    }
    if (symbol && type === 'news') {
      const to = new Date().toISOString().split('T')[0];
      const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const data = await read(`${BASE}/company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${KEY}`);
      if (!Array.isArray(data)) throw new Error('Invalid market news');
      return NextResponse.json(data.slice(0, 10));
    }
    if (symbol) {
      const [quote, profile] = await Promise.all([
        fetchMarketQuote(symbol, KEY, 60, read),
        read(`${BASE}/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${KEY}`),
      ]);
      return NextResponse.json({ quote, profile });
    }
    const symbols = requestedSymbols ?? DEFAULT_SYMBOLS;
    return marketQuoteList(await fetchWithDelay(symbols.map(sym => async () => ({
      symbol: sym, ...await fetchMarketQuote(sym, KEY, 60, read),
    }))));
  } catch {
    return NextResponse.json({ error: 'Market data is temporarily unavailable. Please try again.' }, {
      status: 502, headers: { 'Cache-Control': 'no-store' },
    });
  }
}
