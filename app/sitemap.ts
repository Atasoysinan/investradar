import type { MetadataRoute } from 'next';

const BASE_URL = 'https://www.investradar.live';

// Top crypto coins to include in sitemap
const TOP_CRYPTOS = [
  'bitcoin',
    'ethereum',
      'binancecoin',
        'solana',
          'ripple',
            'cardano',
              'dogecoin',
                'tron',
                  'avalanche-2',
                    'chainlink',
                    ];

                    export default function sitemap(): MetadataRoute.Sitemap {
                      const staticRoutes: MetadataRoute.Sitemap = [
                          {
                                url: `${BASE_URL}`,
                                      lastModified: new Date(),
                                            changeFrequency: 'daily',
                                                  priority: 1.0,
                                                      },
                                                          {
                                                                url: `${BASE_URL}/markets`,
                                                                      lastModified: new Date(),
                                                                            changeFrequency: 'daily',
                                                                                  priority: 0.9,
                                                                                      },
                                                                                          {
                                                                                                url: `${BASE_URL}/videos`,
                                                                                                      lastModified: new Date(),
                                                                                                            changeFrequency: 'weekly',
                                                                                                                  priority: 0.7,
                                                                                                                      },
                                                                                                                        ];
                                                                                                                        
                                                                                                                          const cryptoRoutes: MetadataRoute.Sitemap = TOP_CRYPTOS.map((id) => ({
                                                                                                                              url: `${BASE_URL}/crypto/${id}`,
                                                                                                                                  lastModified: new Date(),
                                                                                                                                      changeFrequency: 'daily' as const,
                                                                                                                                          priority: 0.8,
                                                                                                                                            }));
                                                                                                                                            
                                                                                                                                              return [...staticRoutes, ...cryptoRoutes];
                                                                                                                                              }
