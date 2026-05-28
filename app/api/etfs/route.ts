import { NextResponse } from 'next/server';

const KEY = process.env.FINNHUB_KEY;
const BASE = 'https://finnhub.io/api/v1';

const ETF_INFO: Record<string, { name: string; category: string }> = {
  'SPY':  { name: 'SPDR S&P 500 ETF',                    category: 'US Broad' },
  'QQQ':  { name: 'Invesco QQQ Trust',                   category: 'US Broad' },
  'VTI':  { name: 'Vanguard Total Stock Market ETF',     category: 'US Broad' },
  'VOO':  { name: 'Vanguard S&P 500 ETF',               category: 'US Broad' },
  'IWM':  { name: 'iShares Russell 2000 ETF',            category: 'US Broad' },
  'VNQ':  { name: 'Vanguard Real Estate ETF',            category: 'US Broad' },
  'GLD':  { name: 'SPDR Gold Shares',                    category: 'Commodities' },
  'SLV':  { name: 'iShares Silver Trust',                category: 'Commodities' },
  'TLT':  { name: 'iShares 20+ Year Treasury Bond ETF',  category: 'Bonds' },
  'HYG':  { name: 'iShares iBoxx High Yield Corp Bond',  category: 'Bonds' },
  'EWG':  { name: 'iShares MSCI Germany ETF',            category: 'European' },
  'EWJ':  { name: 'iShares MSCI Japan ETF',              category: 'European' },
  'EWU':  { name: 'iShares MSCI United Kingdom ETF',     category: 'European' },
  'EWQ':  { name: 'iShares MSCI France ETF',             category: 'European' },
  'EWI':  { name: 'iShares MSCI Italy ETF',              category: 'European' },
  'EFA':  { name: 'iShares MSCI EAFE ETF',               category: 'European' },
  'EEM':  { name: 'iShares MSCI Emerging Markets ETF',   category: 'European' },
  'VEA':  { name: 'Vanguard FTSE Developed Markets ETF', category: 'European' },
  'IEMG': { name: 'iShares Core MSCI Emerging Markets',  category: 'European' },
  'ACWI': { name: 'iShares MSCI ACWI ETF',               category: 'European' },
  'ARKK': { name: 'ARK Innovation ETF',                  category: 'Thematic' },
  'ARKG': { name: 'ARK Genomic Revolution ETF',          category: 'Thematic' },
  'ARKW': { name: 'ARK Next Generation Internet ETF',    category: 'Thematic' },
  'BOTZ': { name: 'Global X Robotics & AI ETF',          category: 'Thematic' },
  'ROBO': { name: 'Robo Global Robotics & AI ETF',       category: 'Thematic' },
  'ICLN': { name: 'iShares Global Clean Energy ETF',     category: 'Thematic' },
  'LIT':  { name: 'Global X Lithium & Battery Tech ETF', category: 'Thematic' },
  'HACK': { name: 'ETFMG Prime Cyber Security ETF',      category: 'Thematic' },
  'FINX': { name: 'Global X FinTech ETF',                category: 'Thematic' },
  'SKYY': { name: 'First Trust Cloud Computing ETF',     category: 'Thematic' },
};

const ETF_SYMBOLS = Object.keys(ETF_INFO);

export async function GET() {
  if (!KEY) return NextResponse.json({ error: 'API key not configured' }, { status: 500 });

  const results = await Promise.allSettled(
    ETF_SYMBOLS.map(async (symbol) => {
      const res = await fetch(`${BASE}/quote?symbol=${symbol}&token=${KEY}`, { next: { revalidate: 300 } });
      const data = await res.json();
      const info = ETF_INFO[symbol];
      return { symbol, name: info.name, category: info.category, c: data.c ?? 0, d: data.d ?? 0, dp: data.dp ?? 0 };
    })
  );

  const quotes = results
    .filter(r => r.status === 'fulfilled')
    .map(r => (r as PromiseFulfilledResult<{ symbol: string; name: string; category: string; c: number; d: number; dp: number }>).value)
    .filter(q => q.c > 0);

  return NextResponse.json(quotes);
}
