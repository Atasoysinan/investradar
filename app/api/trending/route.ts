import { checkDataRateLimit } from '@/lib/dataRateLimit';
import { createDataRequest, fetchJson } from '@/lib/dataRequest';
import { NextResponse } from 'next/server';
import { socialRecord } from '@/lib/socialData';

export const dynamic = 'force-dynamic';

const CRYPTO_TICKER_MAP: Record<string, string> = {
  'BTC-USD': 'bitcoin',
  'ETH-USD': 'ethereum',
  'BNB-USD': 'binancecoin',
  'SOL-USD': 'solana',
  'XRP-USD': 'ripple',
  'ADA-USD': 'cardano',
  'DOGE-USD': 'dogecoin',
  'AVAX-USD': 'avalanche-2',
  'LINK-USD': 'chainlink',
  'LTC-USD': 'litecoin',
  'SHIB-USD': 'shiba-inu',
  'PEPE-USD': 'pepe',
};

interface RedditChild {
  data: { title: string; score: number; subreddit: string; permalink: string };
}

const NOISE_WORDS = new Set([
  'THE','AND','FOR','NOT','BUT','ARE','YOU','ALL','CAN','HAS','WAS','ITS',
  'HOW','NEW','NOW','DAY','GET','MAY','BIG','CEO','IPO','SEC','FED','GDP',
  'IMF','USD','EUR','JPY','GBP','ETF','EPS','YTD','ATH','ATL','DCA','WSB',
  'OTC','NYSE','WITH','FROM','THAT','THIS','HAVE','BEEN','WILL','THEY','WERE',
  'WHAT','WHEN','THEIR','ABOUT','WOULD','THERE','COULD','OTHER','MORE','ALSO',
  'INTO','OVER','JUST','LIKE','TIME','VERY','THAN','SAID','EACH','WHICH',
  'SINCE','AFTER','UNDER','STOCK','STOCKS','MARKET','MARKETS','SHARE','SHARES',
  'BULL','BEAR','PUTS','CALLS','HOLD','SELL','EDIT','TLDR','IMHO','YOLO',
  'DD','TA','PE','EV','AI','ML','US','EU','UK','UP','DOWN','AM','PM',
]);


function extractTickers(text: string): string[] {
  const seen = new Set<string>();
  const tickers: string[] = [];
  for (const m of text.matchAll(/\$([A-Z]{1,5})/g)) {
    const t = m[1];
    if (!seen.has(t)) { seen.add(t); tickers.push(t); }
  }
  for (const m of text.matchAll(/(?<![A-Z$])([A-Z]{2,5})(?![A-Z])/g)) {
    const t = m[1];
    if (!seen.has(t) && !NOISE_WORDS.has(t)) { seen.add(t); tickers.push(t); }
  }
  return tickers.slice(0, 5);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function positivePrice(value: unknown): number | null {
  const price = finiteNumber(value);
  return price !== null && price > 0 ? price : null;
}

async function fetchReddit(subreddit: string, read: typeof fetchJson) {
  const json = await read(
    `https://www.reddit.com/r/${subreddit}/hot.json?limit=10&t=day`,
    { headers: { 'User-Agent': 'InvestRadar/1.0 (https://investradar.live)' }, cache: 'no-store' }
  );
  if (socialRecord(json).error) throw new Error('Reddit unavailable');
  const posts: unknown = socialRecord(socialRecord(json).data).children;
  if (!Array.isArray(posts)) throw new Error('Invalid Reddit response');
  return posts.filter((post): post is RedditChild => {
    const row = socialRecord(socialRecord(post).data);
    return typeof row.title === 'string' && row.title.trim().length > 0
      && typeof row.score === 'number' && Number.isFinite(row.score)
      && typeof row.subreddit === 'string' && /^[A-Za-z0-9_]+$/.test(row.subreddit)
      && typeof row.permalink === 'string' && row.permalink.startsWith('/r/');
  });
}

export async function GET(request: Request) {
  const limited = await checkDataRateLimit(request, 'market', 14);
  if (limited) return limited;
  const read = createDataRequest();
  const finnhubKey = process.env.FINNHUB_KEY;

  const [yahooResult, redditRaw, coinsResult] = await Promise.allSettled([
    read('https://query1.finance.yahoo.com/v1/finance/trending/US?count=10', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
    }).then(data => {
      const finance = socialRecord(socialRecord(data).finance);
      const results = finance.result;
      if (finance.error || !Array.isArray(results)
        || (results.length > 0 && !Array.isArray(socialRecord(results[0]).quotes))) throw new Error('Invalid trending response');
      return data;
    }),
    fetchReddit('stocks', read).catch(() => fetchReddit('wallstreetbets', read)),
    read(
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&sparkline=false',
      { headers: { 'Accept': 'application/json' }, cache: 'no-store' }
    ).then(data => {
      if (!Array.isArray(data)) throw new Error('Invalid coins response');
      return data;
    }),
  ]);

  const availability = {
    trending: yahooResult.status === 'fulfilled' ? 'ok' : 'unavailable',
    reddit: redditRaw.status === 'fulfilled' ? 'ok' : 'unavailable',
    coins: coinsResult.status === 'fulfilled' ? 'ok' : 'unavailable',
  };
  if ([yahooResult, redditRaw, coinsResult].every(result => result.status === 'rejected')) {
    return NextResponse.json({ trending: [], reddit: [], coins: [], availability,
      status: 'unavailable', message: 'Trending data is temporarily unavailable. Please try again.' }, {
      status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' },
    });
  }

  // Build trending list with smart per-type price fetching
  const trending: { symbol: string; rank: number; price: number | null; dp: number | null; isCrypto: boolean; cryptoId?: string }[] = [];
  if (yahooResult.status === 'fulfilled') {
    const VALID_TICKER = /^[A-Z]{1,5}(-USD)?$/;
    const results = socialRecord(socialRecord(yahooResult.value).finance).result;
    const quotes = Array.isArray(results) ? socialRecord(results[0]).quotes : null;
    const symbols: string[] = Array.isArray(quotes) ? quotes.flatMap(value => {
      const symbol = socialRecord(value).symbol;
      return typeof symbol === 'string' && (VALID_TICKER.test(symbol) || Object.hasOwn(CRYPTO_TICKER_MAP, symbol))
        ? [symbol] : [];
    }).slice(0, 10) : [];

    // Categorise each symbol
    const cryptoSymbols = symbols.filter(s => CRYPTO_TICKER_MAP[s]);
    const usStockSymbols = symbols.filter(s => !CRYPTO_TICKER_MAP[s] && !s.includes('.'));
    // symbols with '.' are foreign-exchange tickers (e.g. XFAB.PA, 7203.T) — skip pricing

    // Batch-fetch crypto prices from CoinGecko in a single call
    const cgIds = cryptoSymbols.map(s => CRYPTO_TICKER_MAP[s]);
    let cgPrices: Record<string, unknown> = {};
    if (cgIds.length > 0) {
      try {
        const cgRes = await read(
          `https://api.coingecko.com/api/v3/simple/price?ids=${cgIds.join(',')}&vs_currencies=usd&include_24hr_change=true`,
          { headers: { 'Accept': 'application/json' }, cache: 'no-store' }
        );
        cgPrices = socialRecord(cgRes);
      } catch { /* leave cgPrices empty */ }
    }

    // Fetch Finnhub prices for US stocks in parallel
    const finnhubResults = await Promise.allSettled(
      usStockSymbols.map(symbol =>
        read(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${finnhubKey}`, {
          cache: 'no-store',
        })
      )
    );
    const finnhubMap: Record<string, { c: number; dp: number | null }> = {};
    usStockSymbols.forEach((symbol, i) => {
      const q = finnhubResults[i].status === 'fulfilled' ? finnhubResults[i].value : null;
      const row = socialRecord(q);
      if (typeof row.c === 'number' && Number.isFinite(row.c) && row.c > 0) {
        finnhubMap[symbol] = { c: row.c, dp: finiteNumber(row.dp) };
      }
    });

    // Assemble trending items in original Yahoo rank order
    symbols.forEach((symbol, i) => {
      const cryptoId = CRYPTO_TICKER_MAP[symbol];
      const isCrypto = !!cryptoId;
      const isForeign = !isCrypto && symbol.includes('.');

      let price: number | null = null;
      let dp: number | null = null;

      if (isCrypto && cryptoId && cgPrices[cryptoId]) {
        const quote = socialRecord(cgPrices[cryptoId]);
        price = positivePrice(quote.usd);
        dp = finiteNumber(quote.usd_24h_change);
      } else if (!isForeign && finnhubMap[symbol]) {
        price = finnhubMap[symbol].c;
        dp = finnhubMap[symbol].dp;
      }

      trending.push({
        symbol,
        rank: i + 1,
        price,
        dp,
        isCrypto,
        ...(cryptoId ? { cryptoId } : {}),
      });
    });
  }

  let reddit: { title: string; score: number; subreddit: string; tickers: string[]; url: string }[];
  if (redditRaw.status === 'fulfilled') {
    reddit = redditRaw.value.slice(0, 10).map((p: RedditChild) => ({
      title: p.data.title,
      score: p.data.score,
      subreddit: `r/${p.data.subreddit}`,
      tickers: extractTickers(p.data.title),
      url: `https://reddit.com${p.data.permalink}`,
    }));
  } else {
    reddit = [];
  }

  const coins: { id: string; symbol: string; name: string; current_price: number | null; price_change_percentage_24h: number | null }[] = [];
  if (coinsResult.status === 'fulfilled' && Array.isArray(coinsResult.value)) {
    for (const value of coinsResult.value) {
      const c = socialRecord(value);
      if (typeof c.id !== 'string' || !c.id.trim() || typeof c.symbol !== 'string' || !c.symbol.trim()
        || typeof c.name !== 'string' || !c.name.trim()) continue;
      coins.push({ id: c.id, symbol: c.symbol, name: c.name,
        current_price: positivePrice(c.current_price),
        price_change_percentage_24h: finiteNumber(c.price_change_percentage_24h) });
      if (coins.length >= 10) break;
    }
  }

  return NextResponse.json({ trending, reddit, coins, availability }, { headers: { 'Cache-Control': 'no-store',
    ...([yahooResult, redditRaw, coinsResult].some(result => result.status === 'rejected') ? { 'X-Market-Data-Partial': 'true' } : {}) } });
}
