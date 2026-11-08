const API_ROUTES = new Set(['briefs', 'breaking-news', 'penny', 'market', 'trending', 'etfs',
  'global-news', 'news', 'subscribe', 'stocktwits-feed', 'stocktwits', 'topic-news', 'sectors', 'crypto']);
const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

// Fixed labels keep arbitrary paths, search terms and credentials out of logs.
export function trafficEndpoint(pathname: string): string {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path.startsWith('/api/auth/')) return '/api/auth/[...nextauth]';
  if (path.startsWith('/api/')) {
    const name = path.slice(5);
    return API_ROUTES.has(name) ? `/api/${name}` : '/api/[other]';
  }
  if (/^\/stocks\/[^/]+$/.test(path)) return '/stocks/[ticker]';
  if (/^\/crypto\/[^/]+$/.test(path)) return '/crypto/[id]';
  return ['/', '/markets', '/videos', '/robots.txt', '/sitemap.xml'].includes(path) ? path : '/[other]';
}

// User-agent claims are hints, never verified bot identity or an access-control signal.
export function trafficBot(userAgent: string | null): string {
  const ua = (userAgent || '').slice(0, 2048).toLowerCase();
  if (!ua.trim()) return 'unknown';
  if (/googlebot|google-inspectiontool/.test(ua)) return 'google';
  if (/bingbot|bingpreview/.test(ua)) return 'bing';
  if (/gptbot|chatgpt-user|oai-searchbot|claudebot|anthropic-ai|perplexitybot|bytespider|ccbot/.test(ua)) return 'ai-crawler';
  if (/ahrefs|semrush|mj12bot|dotbot/.test(ua)) return 'seo';
  if (/facebookexternalhit|twitterbot|linkedinbot|slackbot|discordbot|telegrambot/.test(ua)) return 'social';
  if (/headless|playwright|puppeteer|curl\/|wget\/|python-requests|python-httpx|go-http-client/.test(ua)) return 'automation';
  if (/bot|crawler|spider|slurp/.test(ua)) return 'other-bot';
  return 'unclassified';
}

export function trafficRecord(request: { nextUrl: { pathname: string }; method: string; headers: Headers },
  environment: string | undefined, now = new Date()) {
  const endpoint = trafficEndpoint(request.nextUrl.pathname);
  return {
    event: 'investradar.request', version: 1, day: now.toISOString().slice(0, 10),
    environment: environment === 'production' || environment === 'preview' ? environment : 'development',
    endpoint, method: METHODS.has(request.method) ? request.method : 'OTHER',
    bot: trafficBot(request.headers.get('user-agent')),
    kind: endpoint.startsWith('/api/') ? 'api'
      : request.headers.get('next-router-prefetch') === '1' || request.headers.get('purpose') === 'prefetch' ? 'prefetch'
        : request.headers.get('rsc') === '1' ? 'rsc' : 'page',
    count: 1,
  };
}
