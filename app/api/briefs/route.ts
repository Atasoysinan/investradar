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
  // Preview must not fall back to the production news API or use its AI quota.
  if (process.env.VERCEL_ENV !== 'production') {
    return NextResponse.json(
      { status: 'unavailable', briefs: [], reason: 'AI briefs are disabled in this test environment until an isolated news source is configured.' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const apiKey = process.env.GROQ_API_KEY;
