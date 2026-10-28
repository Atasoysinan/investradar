import { detailCoin, detailArticles, detailPrice, detailDirection, detailPercent } from '@/lib/detailData';
import { loadCryptoMarket, loadDetailNews } from '@/lib/detailRequests';
import Image from 'next/image';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
    params,
}: {
    params: Promise<{ id: string }>;
}): Promise<Metadata> {
    const { id } = await params;
    const market = await loadCryptoMarket(id);
    const coin = detailCoin(market.data, id);
    const coinName = coin?.name || id.charAt(0).toUpperCase() + id.slice(1);
    const coinSymbol = coin?.symbol.toUpperCase() || '';
    const coinImage = coin?.image || '/globe.svg';
    const price = coin?.price ?? null;
  
    const title = `${coinName}${coinSymbol ? ` (${coinSymbol})` : ''} Price, News & Market Cap`;
    const description = price === null ? `${coinName} market information and latest news on InvestRadar. Price data is temporarily unavailable.`
      : `Live ${coinName} price ${detailPrice(price, 6)}, market cap, and latest news. Track ${coinName} with real-time data on InvestRadar.`;
  
    return {
          title,
          description,
          alternates: { canonical: `https://www.investradar.live/crypto/${id}` },
          openGraph: {
                  title: `${title} | InvestRadar`,
                  description,
                  url: `https://www.investradar.live/crypto/${id}`,
                  images: [{ url: coinImage, width: 100, height: 100, alt: coinName }],
          },
          twitter: {
                  card: 'summary',
                  title: `${coinName} Price & News | InvestRadar`,
                  description,
                  images: [coinImage],
          },
    };
}

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

function formatCompact(n: number | null): string {
  if (n === null) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

export default async function CryptoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const market = await loadCryptoMarket(id);
  const coin = detailCoin(market.data, id);
  const coinName = coin?.name || id;
  const newsQuery = `${coinName} cryptocurrency price`;

  const news = market.read ? await loadDetailNews(newsQuery, market.read) : { data: null, issue: '' };
  const articles = detailArticles(news.data);

  if (!coin) {
    return (
      <div className="min-h-screen bg-[#f5f6f7] flex items-center justify-center">
        <div className="text-center">
          <p role="status" className="text-gray-500 mb-4">{market.issue || <>Could not load data for &quot;{id}&quot;.</>}</p>
          <Link href="/markets" className="text-blue-600 hover:underline text-sm">← Back to Markets</Link>
        </div>
      </div>
    );
  }

  const { price, change: change24h, marketCap, volume, supply, ath } = coin;

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
          <Image unoptimized width={64} height={64} src={coin.image} alt={coin.name} className="w-16 h-16 rounded-full" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{coin.name}</h1>
            <span className="text-sm font-semibold text-gray-400 uppercase tracking-widest">{coin.symbol || '—'}</span>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 mb-6">
          {price === null && <p role="status" className="mb-4 text-gray-500 text-sm">Price data is temporarily unavailable.</p>}
          <div className="flex items-end gap-4 mb-5 flex-wrap">
            <span className="text-4xl font-bold text-gray-900">
              {detailPrice(price, 6)}
            </span>
            <span className={`text-xl font-semibold ${detailDirection(change24h)}`}>
              {detailPercent(change24h)} (24h)
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
                {supply !== null ? `${(supply / 1e6).toFixed(2)}M${coin.symbol ? ` ${coin.symbol.toUpperCase()}` : ''}` : '—'}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">All-Time High</p>
              <p className="font-semibold text-gray-800">
                {detailPrice(ath, 6)}
              </p>
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
