import { NextResponse } from 'next/server';

export const revalidate = 300;

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

const MOCK_REDDIT = [
  { title: '$NVDA hits all-time high — is $200 the next target?', score: 4821, subreddit: 'r/wallstreetbets', tickers: ['NVDA'], url: 'https://reddit.com/r/wallstreetbets' },
  { title: '$TSLA earnings beat: what does this mean for EV sector?', score: 3102, subreddit: 'r/stocks', tickers: ['TSLA'], url: 'https://reddit.com/r/stocks' },
  { title: 'Why $AAPL is still the safest long-term hold in tech', score: 2475, subreddit: 'r/investing', tickers: ['AAPL'], url: 'https://reddit.com/r/investing' },
  { title: '$META ad revenue smashes expectations — AI paying off', score: 1893, subreddit: 'r/stocks', tickers: ['META'], url: 'https://reddit.com/r/stocks' },
  { title: '$AMD vs $NVDA: which chip stock wins the next decade?', score: 987, subreddit: 'r/wallstreetbets', tickers: ['AMD', 'NVDA'], url: 'https://reddit.com/r/wallstreetbets' },
];

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

async function fetchReddit(subreddit: string) {
  const res = await fetch(
    `https://www.reddit.com/r/${subreddit}/hot.json?limit=10&t=day`,
    {
      headers: { 'User-Agent': 'InvestRadar/1.0 (https://investradar.live)' },
      cache: 'no-store',
    }
  );
  if (!res.ok) throw new Error(`Reddit ${subreddit} returned ${res.status}`);
  const json = await res.json();
  const posts: RedditChild[] = json?.data?.children || [];
  if (!posts.length) throw new Error(`Reddit ${subreddit} returned no posts`);
  return posts;
}

export async function GET() {
  const [yahooResult, redditRaw] = await Promise.allSettled([
    fetch('https://query1.finance.yahoo.com/v1/finance/trending/US?count=10', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
    }).then(r => r.json()),
    fetchReddit('stocks').catch(() => fetchReddit('wallstreetbets')),
  ]);

  const trending: { symbol: string; rank: number }[] = [];
  if (yahooResult.status === 'fulfilled') {
    const quotes: { symbol: string }[] = yahooResult.value?.finance?.result?.[0]?.quotes || [];
    quotes.slice(0, 10).forEach((q, i) => {
      trending.push({ symbol: q.symbol, rank: i + 1 });
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
    reddit = MOCK_REDDIT;
  }

  return NextResponse.json({ trending, reddit });
}
