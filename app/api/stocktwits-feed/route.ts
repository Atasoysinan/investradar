import { NextResponse } from 'next/server';

const FALLBACK_DATA = {
  tickers: [
    { symbol: 'NVDA', watchlist_count: 621000, messages: [
      { body: 'NVDA AI demand remains strong heading into next quarter. Holding my position.', created_at: new Date().toISOString(), user: { username: 'trader_mike' }, sentiment: 'Bullish' },
      { body: 'Taking some profits here at resistance. Will re-enter on any dip to $200.', created_at: new Date().toISOString(), user: { username: 'swing_pro' }, sentiment: 'Bearish' },
      { body: 'Data center growth story still intact. Long term hold for me.', created_at: new Date().toISOString(), user: { username: 'long_term_bull' }, sentiment: 'Bullish' },
    ]},
    { symbol: 'TSLA', watchlist_count: 892000, messages: [
      { body: 'TSLA breaking out of the wedge pattern. Volume confirms. Target $480+', created_at: new Date().toISOString(), user: { username: 'chartmaster99' }, sentiment: 'Bullish' },
      { body: 'Margin pressure from price cuts still a concern. Watching from sidelines.', created_at: new Date().toISOString(), user: { username: 'value_skeptic' }, sentiment: 'Bearish' },
      { body: 'FSD progress is the real catalyst here. Patient holders will be rewarded.', created_at: new Date().toISOString(), user: { username: 'tech_investor' }, sentiment: 'Bullish' },
    ]},
    { symbol: 'AAPL', watchlist_count: 743000, messages: [
      { body: 'AAPL services revenue continues to grow. This is a cash flow machine.', created_at: new Date().toISOString(), user: { username: 'dividend_dan' }, sentiment: 'Bullish' },
      { body: 'Valuation stretched at these levels. Hard to justify buying here.', created_at: new Date().toISOString(), user: { username: 'value_hunter' }, sentiment: 'Bearish' },
      { body: 'AI integration into iOS could be the next major revenue driver.', created_at: new Date().toISOString(), user: { username: 'tech_watcher' }, sentiment: 'Bullish' },
    ]},
  ]
};

export async function GET() {
  try {
    const trendRes = await fetch('https://api.stocktwits.com/api/2/trending/symbols.json', {
      headers: { 'User-Agent': 'InvestRadar/1.0' },
      next: { revalidate: 120 }
    });

    if (!trendRes.ok) return NextResponse.json(FALLBACK_DATA);

    const trendData = await trendRes.json();
    const symbols: string[] = (trendData.symbols || [])
      .filter((s: { symbol: string }) => /^[A-Z]{1,5}$/.test(s.symbol))
      .slice(0, 3)
      .map((s: { symbol: string }) => s.symbol);

    if (symbols.length === 0) return NextResponse.json(FALLBACK_DATA);

    const streamResults = await Promise.allSettled(
      symbols.map(sym =>
        fetch(`https://api.stocktwits.com/api/2/streams/symbol/${sym}.json`, {
          headers: { 'User-Agent': 'InvestRadar/1.0' },
          next: { revalidate: 120 }
        }).then(r => r.json())
      )
    );

    const tickers = symbols.map((symbol, i) => {
      const result = streamResults[i];
      const streamData = result.status === 'fulfilled' ? result.value : null;
      const messages = (streamData?.messages || []).slice(0, 3).map((m: {
        body?: string;
        created_at: string;
        user?: { username?: string };
        entities?: { sentiment?: { basic?: string } };
      }) => ({
        body: m.body?.slice(0, 140) || '',
        created_at: m.created_at,
        user: { username: m.user?.username || 'anonymous' },
        sentiment: m.entities?.sentiment?.basic || null,
      }));
      const trendSymbol = trendData.symbols?.find((s: { symbol: string }) => s.symbol === symbol);
      return {
        symbol,
        watchlist_count: trendSymbol?.watchlist_count || 0,
        messages: messages.length > 0 ? messages : FALLBACK_DATA.tickers.find(t => t.symbol === symbol)?.messages || [],
      };
    });

    return NextResponse.json({ tickers });
  } catch {
    return NextResponse.json(FALLBACK_DATA);
  }
}
