import { NextResponse } from 'next/server';

export const revalidate = 300;

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
  const apiKey = process.env.GROQ_API_KEY;
  const debug = new URL(request.url).searchParams.get('debug') === '1';
  if (!apiKey) return NextResponse.json({ status: 'ok', briefs: [], keyPresent: false });

  try {
    const newsRes = await fetch(`${baseUrl()}/api/news?region=us`, { next: { revalidate: 300 } });
    const news = await newsRes.json();
    const articles: PoolArticle[] = (news.articles || [])
      .filter((a: PoolArticle) => a.title && a.title !== '[Removed]')
      .slice(0, 30);

    if (articles.length === 0) {
      return NextResponse.json(debug ? { status: 'debug', keyPresent: true, poolSize: 0, briefs: [] } : { status: 'ok', briefs: [] });
    }

    const numbered = articles
      .map((a, i) => `${i}. [${a.source?.name || 'Source'}] ${a.title}`)
      .join('\n');

    const prompt = `You are a financial news editor building a scannable "brief" digest like Bloomberg's "Five Things".
Below are today's headlines, each with an index number.
Group headlines that cover the SAME specific story/event (a group can be a single headline if it stands alone). Ignore unrelated pairings — do NOT group stories merely because they mention the same person or word.
Return between 6 and 10 of the most important briefs.
Respond with ONLY a JSON array, no prose. Each element:
{"headline":"<max 9 words, punchy, no source name>","summary":"<ONE sentence, max 22 words, neutral, original wording>","indices":[<article index numbers in this group>]}

Headlines:
${numbered}`;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 900,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (debug) {
      const raw = await res.text();
      return NextResponse.json({ status: 'debug', keyPresent: true, poolSize: articles.length, groqStatus: res.status, rawLen: raw.length });
    }
    if (!res.ok) return NextResponse.json({ status: 'ok', briefs: [] });

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '';
    const parsed = extractJson(content);
    const arr: { headline?: string; summary?: string; indices?: number[] }[] =
      Array.isArray(parsed) ? parsed : ((parsed as { briefs?: unknown[] })?.briefs as typeof arr) || [];

    const briefs: Brief[] = [];
    for (const b of arr) {
      if (!b || !b.headline || !b.summary || !Array.isArray(b.indices)) continue;
      const sources = b.indices
        .map((i) => articles[i])
        .filter(Boolean)
        .map((a) => ({ name: a.source?.name || 'Source', url: a.url }));
      if (sources.length === 0) continue;
      const seen = new Set<string>();
      const uniqSources = sources.filter((s) => (seen.has(s.name) ? false : (seen.add(s.name), true)));
      briefs.push({ headline: b.headline.trim(), summary: b.summary.trim(), sources: uniqSources });
    }

    return NextResponse.json({ status: 'ok', briefs: briefs.slice(0, 10) });
  } catch {
    return NextResponse.json({ status: 'ok', briefs: [] });
  }
}
