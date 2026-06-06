import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import TickerBar from '@/components/TickerBar';
import BreakingNewsBanner from '@/components/BreakingNewsBanner';
import Providers from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
      metadataBase: new URL('https://www.investradar.live'),
      title: {
          default: 'InvestRadar — Financial & Geopolitical Intelligence',
              template: '%s | InvestRadar',
      },
      description:
              'Real-time financial news, live stock tickers, crypto prices, sector performance, and geopolitical intelligence — smarter investing starts here.',
      openGraph: {
              siteName: 'InvestRadar',
              type: 'website',
              locale: 'en_US',
              url: 'https://www.investradar.live',
              title: 'InvestRadar — Financial & Geopolitical Intelligence',
              description:
                        'Real-time financial news, live stock tickers, crypto prices, sector performance, and geopolitical intelligence.',
              images: [
                  {
                              url: '/og-default.png',
                              width: 1200,
                              height: 630,
                              alt: 'InvestRadar — Financial & Geopolitical Intelligence',
                  },
                      ],
      },
      twitter: {
              card: 'summary_large_image',
              site: '@InvestRadarLive',
              creator: '@InvestRadarLive',
              title: 'InvestRadar — Financial & Geopolitical Intelligence',
              description:
                        'Real-time financial news, live stock tickers, crypto prices, and geopolitical intelligence.',
              images: ['/og-default.png'],
      },
      robots: {
              index: true,
              follow: true,
              googleBot: { index: true, follow: true },
      },
      alternates: {
              canonical: 'https://www.investradar.live',
      },
      verification: {
              google: 'rVYItmxVGHYcatZ5gfrr_YwBF3i834DKuN2Okw9_ky4',
      },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
      return (
              <html lang="en">
                    <body className={inter.className}>
                            <Providers>
                                      <TickerBar />
                                      <BreakingNewsBanner />
                                {children}
                            </Providers>
                    </body>
              </html>
            );
}
