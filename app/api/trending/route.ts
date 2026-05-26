import { NextResponse } from 'next/server';

export const revalidate = 300;

interface RedditChild {
  data: { title: string; score: number };
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

export async function GET() {
  const [yahooResult, redditResult] = await Promise.allSettled([
    fetch('https://query1.finance.yahoo.com/v1/finance/trending/US?count=10', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
    }).then(r => r.json()),
    fetch('https://www.reddit.com/r/stocks/hot.json?limit=10&t=day', {
      headers: { 'User-Agent': 'InvestRadar/1.0' },
      cache: 'no-store',
    }).then(r => r.json()),
  ]);

  const trending: { symbol: string; rank: number }[] = [];
  if (yahooResult.status === 'fulfilled') {
    const quotes: { symbol: string }[] = yahooResult.value?.finance?.result?.[0]?.quotes || [];
    quotes.slice(0, 10).forEach((q, i) => {
      trending.push({ symbol: q.symbol, rank: i + 1 });
    });
  }

  const reddit: { title: string; score: number; tickers: string[] }[] = [];
  if (redditResult.status === 'fulfilled') {
    const posts: RedditChild[] = redditResult.value?.data?.children || [];
    for (const p of posts.slice(0, 10)) {
      const { title, score } = p.data;
      reddit.push({ title, score, tickers: extractTickers(title) });
    }
  }

  return NextResponse.json({ trending, reddit });
}
