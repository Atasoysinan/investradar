import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Markets',
    description:
          'Live S&P 500, NASDAQ, Penny Stocks, and sector ETF performance. Real-time market data, stock prices, and financial news on InvestRadar.',
    alternates: { canonical: 'https://www.investradar.live/markets' },
    openGraph: {
          title: 'Markets | InvestRadar',
          description:
                  'Live S&P 500, NASDAQ, Penny Stocks, and sector ETF performance with real-time market data and financial news.',
          url: 'https://www.investradar.live/markets',
          images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Markets — InvestRadar' }],
    },
    twitter: {
          card: 'summary_large_image',
          title: 'Markets | InvestRadar',
          description:
                  'Live S&P 500, NASDAQ, Penny Stocks, and sector ETF performance with real-time data.',
          images: ['/og-default.png'],
    },
};

export default function MarketsLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>>;
}</>
