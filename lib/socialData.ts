export function socialRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}

export function socialCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function sentiment(value: unknown): string | null {
  return value === 'Bullish' || value === 'Bearish' ? value : null;
}

export function stocktwitsSymbols(payload: unknown) {
  const symbols = socialRecord(payload).symbols;
  if (!Array.isArray(symbols)) throw new Error('Invalid Stocktwits response');
  return symbols.flatMap(value => {
    const row = socialRecord(value);
    if (typeof row.symbol !== 'string' || !/^[A-Z0-9][A-Z0-9._-]{0,14}$/.test(row.symbol)) return [];
    return [{ symbol: row.symbol, name: typeof row.title === 'string' ? row.title : row.symbol,
      watchlist_count: socialCount(row.watchlist_count), sentiment: sentiment(socialRecord(row.sentiment).basic) }];
  });
}

export function stocktwitsMessages(payload: unknown) {
  const messages = socialRecord(payload).messages;
  if (!Array.isArray(messages)) throw new Error('Invalid Stocktwits stream');
  return messages.flatMap(value => {
    const row = socialRecord(value); const user = socialRecord(row.user);
    if (typeof row.body !== 'string' || !row.body.trim() || typeof user.username !== 'string' || !user.username.trim()
      || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))) return [];
    return [{ body: row.body.slice(0, 140), created_at: row.created_at, user: { username: user.username },
      sentiment: sentiment(socialRecord(socialRecord(row.entities).sentiment).basic) }];
  }).slice(0, 3);
}
