export function detailRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function detailText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
export function detailNumber(value: unknown, nonnegative = false): number | null {
  return typeof value === 'number' && Number.isFinite(value) && (!nonnegative || value >= 0) ? value : null;
}
function positive(value: unknown): number | null {
  const number = detailNumber(value, true);
  return number !== null && number > 0 ? number : null;
}
function webUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  try { return ['https:', 'http:'].includes(new URL(value).protocol) ? value : ''; } catch { return ''; }
}
export function detailQuote(value: unknown) {
  const row = detailRecord(value);
  const prices = { c: positive(row.c), h: positive(row.h), l: positive(row.l), pc: positive(row.pc) };
  const hasData = !('error' in row) && Object.values(prices).some(value => value !== null);
  return hasData ? { ...prices, d: detailNumber(row.d), dp: detailNumber(row.dp) }
    : { c: null, h: null, l: null, pc: null, d: null, dp: null };
}
export function detailProfile(value: unknown) {
  const row = detailRecord(value);
  return { name: detailText(row.name), exchange: detailText(row.exchange), finnhubIndustry: detailText(row.finnhubIndustry) };
}
export function detailCoin(value: unknown, id: string) {
  const row = detailRecord(value);
  if ('error' in row || (!detailText(row.name) && !detailText(row.symbol) && !Object.keys(detailRecord(row.market_data)).length)) return null;
  const market = detailRecord(row.market_data);
  return {
    name: detailText(row.name) || id.charAt(0).toUpperCase() + id.slice(1), symbol: detailText(row.symbol),
    image: webUrl(detailRecord(row.image).large) || '/globe.svg',
    price: detailNumber(detailRecord(market.current_price).usd, true), change: detailNumber(market.price_change_percentage_24h),
    marketCap: detailNumber(detailRecord(market.market_cap).usd, true), volume: detailNumber(detailRecord(market.total_volume).usd, true),
    supply: detailNumber(market.circulating_supply, true), ath: detailNumber(detailRecord(market.ath).usd, true),
  };
}
export function detailArticles(value: unknown) {
  const articles = detailRecord(value).articles;
  if (!Array.isArray(articles)) return [];
  return articles.flatMap(value => {
    const row = detailRecord(value), title = detailText(row.title), url = webUrl(row.url);
    if (!title || title === '[Removed]' || !url) return [];
    const date = detailText(row.publishedAt);
    return [{ title, url, description: detailText(row.description), urlToImage: webUrl(row.urlToImage),
      publishedAt: Number.isFinite(Date.parse(date)) ? date : '', source: { name: detailText(detailRecord(row.source).name) || 'Source' } }];
  });
}
export function detailPrice(value: number | null, smallDecimals = 2): string {
  if (value === null) return '—';
  return value >= 1 ? `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${value.toFixed(smallDecimals)}`;
}
export function detailDirection(value: number | null): string {
  return value === null || value === 0 ? 'text-gray-500' : value > 0 ? 'text-green-600' : 'text-red-600';
}
export function detailPercent(value: number | null): string {
  if (value === null) return '—';
  return `${value > 0 ? '▲ ' : value < 0 ? '▼ ' : ''}${Math.abs(value).toFixed(2)}%`;
}
