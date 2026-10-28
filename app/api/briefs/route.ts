import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { getBriefsRateLimit } from '@/lib/briefsRateLimit';


export const dynamic = 'force-dynamic';
const REQUEST_TIMEOUT_MS = 12_000;
class BriefsTimeout extends Error {}

function unavailable(status: number, message: string, retryAfter?: number) {
  return NextResponse.json({ status: 'unavailable', briefs: [], message }, {
    status, headers: { 'Cache-Control': 'no-store',
      ...(retryAfter === undefined ? {} : { 'Retry-After': String(Math.max(1, Math.ceil(retryAfter / 1000))) }) },
  });
}


interface PoolArticle {
  title: string;
  description: string;
  url: string;
  publishedAt: string;
  source: { name: string };
}


interface Brief {
  headline: string;
  summary: string;
  sources: { name: string; url: string }[];
}

const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';


function baseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://www.investradar.live';
}


function extractJson(text: string): unknown | null {
  const start = text.search(/[[{]/);
  if (start === -1) return null;
  const slice = text.slice(start);
  try { return JSON.parse(slice); } catch {}
  const lastArr = slice.lastIndexOf(']');
  const lastObj = slice.lastIndexOf('}');
  const end = Math.max(lastArr, lastObj);
  if (end > 0) { try { return JSON.parse(slice.slice(0, end + 1)); } catch {} }
  return null;
}


export async function GET(request: Request) {
  // Preview must not fall back to the production news API or use its AI quota.
  if (process.env.VERCEL_ENV !== 'production') {
    return NextResponse.json(
      { status: 'unavailable', briefs: [], reason: 'AI briefs are disabled in this test environment until an isolated news source is configured.' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const apiKey = process.env.GROQ_API_KEY;
  const debug = new URL(request.url).searchParams.get('debug') === '1';
  if (!apiKey) return unavailable(503, 'AI summaries are temporarily unavailable. Please try again.');

  const forwarded = process.env.VERCEL === '1' ? request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim() : undefined;
  const client = createHash('sha256').update(forwarded && isIP(forwarded) ? forwarded : 'unknown-client').digest('hex');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  function ensureActive() { if (controller.signal.aborted) throw new BriefsTimeout(); }
  async function generate() {
    let retryAfter: number;
    try { retryAfter = await getBriefsRateLimit().limit(client); }
    catch {
      ensureActive();
      return unavailable(503, 'AI summaries are temporarily unavailable. Please try again.', 30_000);
    }
    ensureActive();
    if (retryAfter > 0) return unavailable(429, 'AI summaries are busy. Please try again shortly.', retryAfter);

    const newsRes = await fetch(`${baseUrl()}/api/news?region=us`, { signal: controller.signal, redirect: 'error', next: { revalidate: 300 } });
    if (!newsRes.ok) throw new Error('News unavailable');
    const news = await newsRes.json();
    ensureActive();
    if (!Array.isArray(news?.articles)) throw new Error('Invalid news response');
    const articles: PoolArticle[] = (news.articles || [])
      .filter((a: PoolArticle) => a && typeof a.title === 'string' && a.title && a.title !== '[Removed]' && typeof a.url === 'string')
      .slice(0, 30);

    if (articles.length === 0) {
      return NextResponse.json(debug ? { status: 'debug', keyPresent: true, poolSize: 0, briefs: [] } : { status: 'ok', briefs: [] }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const numbered = articles
      .map((a, i) => `${i}. [${a.source?.name || 'Source'}] ${a.title}`)
      .join('\n');

    const prompt = `You are a financial news editor building a scannable "brief" digest like Bloomberg's "Five Things".
Below are today's headlines, each with an index number.
Group headlines that cover the SAME specific story/event (a group can be a single headline if it stands alone). Ignore unrelated pairings — do NOT group stories merely because they mention the same person or word.
Return between 6 and 10 of the most important briefs.
Respond with ONLY a JSON object with a "briefs" array and no prose. Each array element:
{"headline":"<max 9 words, punchy, no source name>","summary":"<ONE sentence, max 22 words, neutral, original wording>","indices":[<article index numbers in this group>]}

Headlines:
${numbered}`;

    ensureActive();
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      signal: controller.signal, redirect: 'error',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: 900,
        reasoning_effort: 'low',
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) throw new Error('AI provider unavailable');
    if (debug) {
      const raw = await res.text();
      ensureActive();
      return NextResponse.json({ status: 'debug', keyPresent: true, poolSize: articles.length, groqStatus: res.status, rawLen: raw.length }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const data = await res.json();
    ensureActive();
    const content = data?.choices?.[0]?.message?.content || '';
    const parsed = extractJson(content);
    const arr: { headline?: string; summary?: string; indices?: number[] }[] =
      Array.isArray(parsed) ? parsed : ((parsed as { briefs?: unknown[] })?.briefs as typeof arr) || [];

    const briefs: Brief[] = [];
    for (const b of arr) {
      if (!b || typeof b.headline !== 'string' || !b.headline.trim()
        || typeof b.summary !== 'string' || !b.summary.trim() || !Array.isArray(b.indices)) continue;
      const sources = b.indices
        .filter((i) => Number.isInteger(i) && i >= 0 && i < articles.length)
        .map((i) => articles[i])
        .filter(Boolean)
        .map((a) => ({ name: a.source?.name || 'Source', url: a.url }));
      if (sources.length === 0) continue;
      const seen = new Set<string>();
      const uniqSources = sources.filter((s) => (seen.has(s.name) ? false : (seen.add(s.name), true)));
      briefs.push({ headline: b.headline.trim(), summary: b.summary.trim(), sources: uniqSources });
    }

    return NextResponse.json({ status: 'ok', briefs: briefs.slice(0, 10) }, { headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    return await Promise.race([
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new BriefsTimeout()); controller.abort();
        }, REQUEST_TIMEOUT_MS);
      }),
      generate(),
    ]);
  } catch (error) {
    if (error instanceof BriefsTimeout) return unavailable(504, 'AI summaries timed out. Please try again.', 30_000);
    return unavailable(502, 'AI summaries are temporarily unavailable. Please try again.');
  } finally {
    clearTimeout(timer);
  }
}
