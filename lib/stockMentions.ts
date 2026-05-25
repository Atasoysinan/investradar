const COMPANY_TICKER_MAP: Record<string, string> = {
  'apple': 'AAPL', 'iphone': 'AAPL', 'ipad': 'AAPL',
  'microsoft': 'MSFT', 'windows': 'MSFT', 'azure': 'MSFT', 'activision': 'MSFT', 'openai': 'MSFT',
  'google': 'GOOGL', 'alphabet': 'GOOGL', 'youtube': 'GOOGL',
  'amazon': 'AMZN', 'aws': 'AMZN',
  'tesla': 'TSLA', 'elon musk': 'TSLA',
  'nvidia': 'NVDA', 'nvda': 'NVDA',
  'meta': 'META', 'facebook': 'META', 'instagram': 'META',
  'netflix': 'NFLX',
  'walmart': 'WMT',
  'jpmorgan': 'JPM', 'jp morgan': 'JPM',
  'boeing': 'BA',
  'disney': 'DIS',
  'uber': 'UBER',
  'airbnb': 'ABNB',
  'palantir': 'PLTR',
  'coinbase': 'COIN',
  'bitcoin': 'COIN', 'crypto': 'COIN',
  'spacex': 'TSLA',
  'anthropic': 'AMZN',
};

export function extractTickers(headline: string, description: string): string[] {
  const text = (headline + ' ' + (description || '')).toLowerCase();
  const found = new Set<string>();
  for (const [keyword, ticker] of Object.entries(COMPANY_TICKER_MAP)) {
    if (text.includes(keyword)) found.add(ticker);
    if (found.size >= 3) break;
  }
  return Array.from(found);
}
