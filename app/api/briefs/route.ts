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
  title: string;
  summary: string;
  sources: { name: string; url: string }[];
  publishedAt: string;
}

const CLUSTER_TERMS = [
  'fed','inflation','tariff','rate','recession','oil','opec','bitcoin','crypto',
  'ai','chip','semiconductor','earnings','ipo','merger','bank','election',
  'war','sanction','ukraine','israel','china','russia','trump','nvidia','apple',
  'tesla','microsoft','google','amazon','meta','gdp','jobs','housing','gold',
];

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://www.investradar.live';
}

function cluster(articles: PoolArticle[]): { term: string; items: PoolArticle[] }[] {
  const groups: Record<string, PoolArticle[]> = {};
  for (const a of articles) {
    const hay = ((a.title || '') + ' ' + (a.description || '')).toLowerCase();
    for (const term of CLUSTER_TERMS) {
      if (hay.includes(term)) {
        (groups[term] = groups[term] || []).push(a);
      }
    }
  }
  const out: { term: string; items: PoolArticle[] }[] = [];
  for (const term of Object.keys(groups)) {
    const items = groups[term];
    const sources = new Set(items.map((i) => i.source?.name));
    if (sources.size >= 2) out.push({ term, items: items.slice(0, 4) });
  }
  out.sort((a, b) => b.items.length - a.items.length);
  return out.slice(0, 5);
}

async function summarize(items: PoolArticle[], apiKey: string): Promise<string | null> {
  const sourceLines = items
    .map((i) => `- [${i.source?.name || 'Source'}] ${i.title}: ${(i.description || '').replace(/<[^>]+>/g, '').slice(0, 160)}`)
    .join('\n');
  const prompt = `You are a financial news editor. Using ONLY the headlines and snippets below, write a neutral, factual 2-3 sentence brief synthesizing what multiple outlets are reporting on this topic. Do not copy phrasing; write original wording. Do not add facts not present below.\n\n${sourceLines}`;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 160,
        temperature: 0.3,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  const debug = new URL(request.url).searchParams.get('debug') === '1';
  if (!apiKey) return NextResponse.json({ status: 'ok', briefs: [], keyPresent: false });

  try {
    const newsRes = await fetch(`${baseUrl()}/api/news?region=us`, { next: { revalidate: 300 } });
    const news = await newsRes.json();
    const articles: PoolArticle[] = (news.articles || []).filter((a: PoolArticle) => a.title && a.title !== '[Removed]');
    const clusters = cluster(articles);
    let groqStatus = -1;
    if (debug && clusters.length) {
      const probe = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: [{ role: 'user', content: 'Reply with the word ok.' }], max_tokens: 5 }),
      });
      groqStatus = probe.status;
    }
    if (debug) return NextResponse.json({ status: 'debug', keyPresent: true, poolSize: articles.length, clusterCount: clusters.length, groqStatus });

    const briefs: Brief[] = [];
    for (const c of clusters) {
      const summary = await summarize(c.items, apiKey);
      if (!summary) continue;
      briefs.push({
        title: c.items[0].title,
        summary,
        sources: c.items.map((i) => ({ name: i.source?.name || 'Source', url: i.url })),
        publishedAt: c.items[0].publishedAt,
      });
    }
    return NextResponse.json({ status: 'ok', briefs });
  } catch {
    return NextResponse.json({ status: 'ok', briefs: [] });
  }
}
