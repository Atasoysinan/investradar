import { detailQuote, detailProfile, detailArticles, detailPrice, detailDirection, detailPercent } from '@/lib/detailData';
import { loadStockMarket, loadDetailNews } from '@/lib/detailRequests';
import Image from 'next/image';
import Link from 'next/link';


function timeAgo(dateStr: string) {
  if (!dateStr) return 'Date unavailable';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export const dynamic = 'force-dynamic';

export default async function StockDetailPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  const symbol = ticker.toUpperCase();

  const market = await loadStockMarket(symbol);
  const quote = detailQuote(market.quote);
  const profile = detailProfile(market.profile);

  const companyName = profile?.name || '';
  const newsQuery = companyName
    ? `${companyName} stock ${symbol}`
    : `${symbol} stock market`;

  const news = market.read ? await loadDetailNews(newsQuery, market.read) : { data: null, issue: '' };
  const articles = detailArticles(news.data);

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
        {market.issue && <p role="alert" className="mb-4 text-sm text-gray-600">{market.issue}</p>}
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
          {quote.c === null && <p role="status" className="mb-4 text-gray-500 text-sm">Price data is temporarily unavailable for {symbol}.</p>}
          <div className="flex items-end gap-4 mb-5 flex-wrap">
            <span className="text-4xl font-bold text-gray-900">
              {detailPrice(quote.c)}
            </span>
            <span className="text-xl font-semibold">
              <span className={detailDirection(quote.d)}>{quote.d === null ? '—' : `${quote.d > 0 ? '+' : ''}${quote.d.toFixed(2)}`}</span>
              &nbsp;<span className={detailDirection(quote.dp)}>({detailPercent(quote.dp)})</span>
            </span>
          </div>
          <div className="grid grid-cols-3 gap-6 text-sm border-t border-gray-100 pt-4">
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">High</p>
              <p className="font-semibold text-gray-800">{detailPrice(quote.h)}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Low</p>
              <p className="font-semibold text-gray-800">{detailPrice(quote.l)}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Prev Close</p>
              <p className="font-semibold text-gray-800">{detailPrice(quote.pc)}</p>
            </div>
          </div>

        </div>

        {news.issue && <p role="status" className="mb-4 text-sm text-gray-600">{news.issue} News could not be loaded.</p>}
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
                    <Image unoptimized width={96} height={72}
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
