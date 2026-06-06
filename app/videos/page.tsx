import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Finance Videos',
    description:
          'Curated financial and investment videos from CNBC, Bloomberg, Yahoo Finance, The Economist, WSJ, and Investopedia. Learn markets, crypto, ETFs, and macroeconomics.',
    alternates: { canonical: 'https://www.investradar.live/videos' },
    openGraph: {
          title: 'Finance Videos | InvestRadar',
          description:
                  'Curated videos from CNBC, Bloomberg, Yahoo Finance, The Economist, WSJ and Investopedia.',
          url: 'https://www.investradar.live/videos',
          images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Finance Videos — InvestRadar' }],
    },
    twitter: {
          card: 'summary_large_image',
          title: 'Finance Videos | InvestRadar',
          description: 'Curated finance videos from CNBC, Bloomberg, Yahoo Finance, The Economist, WSJ & Investopedia.',
          images: ['/og-default.png'],
    },
};

import Link from 'next/link';

const VIDEOS = [
  { id: 'p7HKvqRI_Bo', title: 'How The Economic Machine Works',        channel: 'Ray Dalio',          tag: 'Macro' },
  { id: 'ZCFkWDdmXG8', title: 'How to Invest for Beginners',           channel: 'Graham Stephan',     tag: 'Investing' },
  { id: 'Rm9JGFMqKFc', title: 'Warren Buffett: How Most People Should Invest', channel: 'CNBC',       tag: 'Investing' },
  { id: 'Kl7QFR0NMDE', title: 'Index Funds vs ETFs vs Mutual Funds',   channel: 'Andrei Jikh',        tag: 'ETFs' },
  { id: 'lNdOtlpmH5U', title: 'Stock Market Explained Simply',         channel: 'Investopedia',       tag: 'Markets' },
  { id: '3ez10ADR_gM', title: 'How to Read a Balance Sheet',           channel: 'Accounting Stuff',   tag: 'Fundamentals' },
  { id: 'dbU2Vf3PZCA', title: 'What is Inflation?',                    channel: 'Economics Explained',tag: 'Macro' },
  { id: 'OOejFn6JMMM', title: 'How the Fed Controls Interest Rates',   channel: 'The Plain Bagel',    tag: 'Macro' },
  { id: 'yIiyHHzBqts', title: 'How Hedge Funds Make Money',            channel: 'Patrick Boyle',      tag: 'Markets' },
  { id: 'Nu4lHaSh7D4', title: 'Crypto Explained: Bitcoin vs Ethereum', channel: 'Whiteboard Crypto',  tag: 'Crypto' },
  { id: 'Xn7KWR9EOGQ', title: 'How to Value a Stock',                  channel: 'The Swedish Investor',tag: 'Investing' },
  { id: 'PHe0bXAIuk0', title: 'ETF Investing Explained',               channel: 'The Plain Bagel',    tag: 'ETFs' },
];

const TAG_COLORS: Record<string, string> = {
  Macro:        'bg-purple-100 text-purple-700',
  Markets:      'bg-blue-100 text-blue-700',
  Investing:    'bg-green-100 text-green-700',
  ETFs:         'bg-cyan-100 text-cyan-700',
  Fundamentals: 'bg-yellow-100 text-yellow-700',
  Crypto:       'bg-orange-100 text-orange-700',
};

export default function VideosPage() {
  return (
    <div className="min-h-screen bg-[#f5f6f7] text-gray-900">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-sm text-white">IR</div>
            <span className="text-lg font-bold text-gray-900">InvestRadar</span>
          </Link>
          <span className="text-gray-300 mx-1">/</span>
          <span className="text-gray-900 font-semibold text-sm">Finance Videos</span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Finance Videos</h1>
          <p className="text-gray-500">Curated financial education from top creators and institutions.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {VIDEOS.map((v) => (
            <div key={v.id} className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
              <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                <iframe
                  src={`https://www.youtube.com/embed/${v.id}`}
                  title={v.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                />
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${TAG_COLORS[v.tag] ?? 'bg-gray-100 text-gray-600'}`}>
                    {v.tag}
                  </span>
                  <span className="text-xs text-gray-500 font-medium">{v.channel}</span>
                </div>
                <h3 className="font-semibold text-gray-900 text-sm leading-snug">{v.title}</h3>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
