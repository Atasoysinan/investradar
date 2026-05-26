import Link from 'next/link';

const NEWS_DOMAINS = 'reuters.com,apnews.com,wsj.com,ft.com,cnbc.com,bloomberg.com,forbes.com,marketwatch.com,businessinsider.com,seekingalpha.com,benzinga.com';

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface Article {
  title: string;
  description: string;
  url: string;
  urlToImage: string;
  publishedAt: string;
  source: { name: string };
}

export default async function StockDetailPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  const symbol = ticker.toUpperCase();

  const finnhubKey = process.env.FINNHUB_KEY;
  const newsKey = process.env.NEWSAPI_KEY;

  const [quoteRes, profileRes, newsRes] = await Promise.allSettled([
    fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${finnhubKey}`, {
      next: { revalidate: 60 },
    }).then(r => r.json()),
    fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${finnhubKey}`, {
      next: { revalidate: 3600 },
    }).then(r => r.json()),
    fetch(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(symbol)}&domains=${NEWS_DOMAINS}&language=en&sortBy=publishedAt&pageSize=5&apiKey=${newsKey}`,
      { next: { revalidate: 300 } }
    ).then(r => r.json()),
  ]);

  const quote = quoteRes.status === 'fulfilled' ? quoteRes.value : null;
  const profile = profileRes.status === 'fulfilled' ? profileRes.value : null;
  const articles: Article[] = newsRes.status === 'fulfilled'
    ? (newsRes.value?.articles || []).filter((a: Article) => a.title !== '[Removed]')
    : [];

  const hasPrice = quote && quote.c > 0;

  return (
    <div className="min-h-screen bg-[#f5f6f7] text-gray-900">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-sm text-white">IR</div>
            <span className="text-lg font-bold text-gray-900">InvestRadar</span>
          </Link>
          <span className="text-gray-300 mx-1">/</span>
          <Link href="/markets" className="text-gray-500 hover:text-gray-900 font-medium text-sm">Markets</Link>
          <span className="text-gray-300 mx-1">/</span>
          <span className="text-gray-900 font-semibold text-sm">{symbol}</span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">{symbol}</h1>
          {profile?.name && <p className="text-gray-600 mt-1 text-lg">{profile.name}</p>}
          {profile?.exchange && (
            <p className="text-xs text-gray-400 mt-1 uppercase tracking-wide">
              {profile.exchange}{profile.finnhubIndustry ? ` · ${profile.finnhubIndustry}` : ''}
            </p>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 mb-6">
          {hasPrice ? (
            <>
              <div className="flex items-end gap-4 mb-5 flex-wrap">
                <span className="text-4xl font-bold text-gray-900">
                  ${quote.c.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className={`text-xl font-semibold ${quote.d >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {quote.d >= 0 ? '+' : ''}{quote.d.toFixed(2)}&nbsp;
                  ({quote.dp >= 0 ? '▲' : '▼'} {Math.abs(quote.dp).toFixed(2)}%)
                </span>
              </div>
              <div className="grid grid-cols-3 gap-6 text-sm border-t border-gray-100 pt-4">
                <div>
                  <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">High</p>
                  <p className="font-semibold text-gray-800">${quote.h.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Low</p>
                  <p className="font-semibold text-gray-800">${quote.l.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Prev Close</p>
                  <p className="font-semibold text-gray-800">${quote.pc.toFixed(2)}</p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-gray-500 text-sm">Market closed or data unavailable for {symbol}.</p>
          )}
        </div>

        {articles.length > 0 && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Latest News</h2>
            <div className="space-y-3">
              {articles.map((a, i) => (
                <a
                  key={i}
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow gap-4 group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold bg-gray-800 text-white px-2 py-0.5 rounded">
                        {a.source?.name}
                      </span>
                      <span className="text-xs text-gray-400">{timeAgo(a.publishedAt)}</span>
                    </div>
                    <h3 className="font-semibold text-gray-900 leading-snug group-hover:text-blue-700 transition-colors">
                      {a.title}
                    </h3>
                    {a.description && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{a.description}</p>
                    )}
                  </div>
                  {a.urlToImage && (
                    <img
                      src={a.urlToImage}
                      alt=""
                      className="w-24 h-18 object-cover rounded flex-shrink-0 hidden sm:block"
                      style={{ height: '72px' }}
                    />
                  )}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
