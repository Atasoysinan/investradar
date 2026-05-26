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

function formatCompact(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

interface Article {
  title: string;
  description: string;
  url: string;
  urlToImage: string;
  publishedAt: string;
  source: { name: string };
}

interface CoinDetail {
  id: string;
  symbol: string;
  name: string;
  image: { large: string };
  market_data: {
    current_price: { usd: number };
    price_change_percentage_24h: number;
    market_cap: { usd: number };
    total_volume: { usd: number };
    circulating_supply: number;
    ath: { usd: number };
    ath_date: { usd: string };
  };
}

export default async function CryptoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const newsKey = process.env.NEWSAPI_KEY;

  const [coinRes, newsRes] = await Promise.allSettled([
    fetch(
      `https://api.coingecko.com/api/v3/coins/${id}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`,
      { headers: { 'Accept': 'application/json' }, next: { revalidate: 60 } }
    ).then(r => r.json()),
    fetch(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(id)}&domains=${NEWS_DOMAINS}&language=en&sortBy=publishedAt&pageSize=5&apiKey=${newsKey}`,
      { next: { revalidate: 300 } }
    ).then(r => r.json()),
  ]);

  const coin: CoinDetail | null = coinRes.status === 'fulfilled' && !coinRes.value.error
    ? coinRes.value
    : null;

  const articles: Article[] = newsRes.status === 'fulfilled'
    ? (newsRes.value?.articles || []).filter((a: Article) => a.title !== '[Removed]')
    : [];

  if (!coin) {
    return (
      <div className="min-h-screen bg-[#f5f6f7] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Could not load data for &quot;{id}&quot;.</p>
          <Link href="/markets" className="text-blue-600 hover:underline text-sm">← Back to Markets</Link>
        </div>
      </div>
    );
  }

  const price = coin.market_data.current_price.usd;
  const change24h = coin.market_data.price_change_percentage_24h;
  const marketCap = coin.market_data.market_cap.usd;
  const volume = coin.market_data.total_volume.usd;
  const supply = coin.market_data.circulating_supply;
  const ath = coin.market_data.ath.usd;

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
          <span className="text-gray-900 font-semibold text-sm">{coin.name}</span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center gap-4 mb-6">
          <img src={coin.image.large} alt={coin.name} className="w-16 h-16 rounded-full" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{coin.name}</h1>
            <span className="text-sm font-semibold text-gray-400 uppercase tracking-widest">{coin.symbol}</span>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-end gap-4 mb-5 flex-wrap">
            <span className="text-4xl font-bold text-gray-900">
              {price >= 1
                ? `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : `$${price.toFixed(6)}`}
            </span>
            <span className={`text-xl font-semibold ${change24h >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {change24h >= 0 ? '▲' : '▼'} {Math.abs(change24h).toFixed(2)}% (24h)
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-gray-100 pt-4">
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Market Cap</p>
              <p className="font-semibold text-gray-800">{formatCompact(marketCap)}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">24h Volume</p>
              <p className="font-semibold text-gray-800">{formatCompact(volume)}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Circulating Supply</p>
              <p className="font-semibold text-gray-800">
                {supply ? `${(supply / 1e6).toFixed(2)}M ${coin.symbol.toUpperCase()}` : '—'}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">All-Time High</p>
              <p className="font-semibold text-gray-800">
                {ath >= 1
                  ? `$${ath.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : `$${ath.toFixed(6)}`}
              </p>
            </div>
          </div>
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
                      className="w-24 object-cover rounded flex-shrink-0 hidden sm:block"
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
