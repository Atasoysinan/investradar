// HTTP 200 can still contain a provider error or an invalid payload.
export function newsArticles(payload: unknown, field = 'articles'): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid news response');
  const data = payload as Record<string, unknown>;
  const errors = data.errors;
  if (data.status === 'error' || data.success === false || data.error
    || (Array.isArray(errors) ? errors.length > 0 : Boolean(errors))) throw new Error('News provider unavailable');
  const rows = data[field];
  if (!Array.isArray(rows)) throw new Error('Invalid news response');
  const valid = rows.filter((row): row is Record<string, unknown> => row !== null && typeof row === 'object'
    && typeof row.title === 'string' && row.title.trim().length > 0
    && ((typeof row.url === 'string' && row.url.trim().length > 0) || (typeof row.link === 'string' && row.link.trim().length > 0)));
  if (rows.length > 0 && valid.length === 0) throw new Error('Invalid news articles');
  return valid;
}
