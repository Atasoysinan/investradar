import Link from 'next/link';

const VIDEOS = [
  { id: 'h4RkFcBFchE', title: 'Fed Rate Decision Explained',        channel: 'Bloomberg',         tag: 'Macro' },
  { id: '9sWQoRbcDzQ', title: 'S&P 500 Outlook 2025',               channel: 'CNBC',              tag: 'Markets' },
  { id: 'mF2bH8aAIXQ', title: 'How Hedge Funds Actually Work',      channel: 'Patrick Boyle',     tag: 'Investing' },
  { id: 'oN5QplFkHCM', title: 'The Truth About Index Funds',        channel: 'Graham Stephan',    tag: 'Investing' },
  { id: 'IgVBZPGBo8A', title: 'How to Invest in Your 20s',          channel: 'Andrei Jikh',       tag: 'Investing' },
  { id: 'vPgm7U2N2UA', title: 'Global Macro Outlook',               channel: 'Real Vision',       tag: 'Macro' },
  { id: '86OEKarFGs8', title: 'Stock Market Basics',                 channel: 'Investopedia',      tag: 'Education' },
  { id: 'PHe0bXAIuk0', title: 'ETF Investing Explained',            channel: 'The Plain Bagel',   tag: 'Investing' },
  { id: '4l4GHoHFHKM', title: 'How to Read Financial Statements',   channel: 'Ticker Symbol: YOU',tag: 'Education' },
  { id: 'lMqgOOkCRq0', title: 'Macro Economics 2025',               channel: 'Lyn Alden',         tag: 'Macro' },
  { id: 'oi6M5KBWydg', title: 'How to Value a Company',             channel: 'Aswath Damodaran',  tag: 'Investing' },
  { id: 'AZKxq9lnIgs', title: 'Why Most Stock Pickers Fail',        channel: 'Ben Felix',         tag: 'Investing' },
];

const TAG_COLORS: Record<string, string> = {
  Macro:     'bg-purple-100 text-purple-700',
  Markets:   'bg-blue-100 text-blue-700',
  Investing: 'bg-green-100 text-green-700',
  Education: 'bg-orange-100 text-orange-700',
};

export default function VideosPage() {
  return (
    <div className="min-h-screen bg-[#f5f6f7] text-gray-900">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-sm text-white">IR</div>
            <span className="text-lg font-bold text-gray-900">InvestRadar</span>
          </Link>
          <span className="text-gray-300 mx-1">/</span>
          <span className="text-gray-900 font-semibold text-sm">Finance Videos</span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Finance Videos</h1>
          <p className="text-gray-500">Curated financial education from top creators and institutions.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {VIDEOS.map((v) => (
            <div key={v.id} className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
              <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                <iframe
                  src={`https://www.youtube.com/embed/${v.id}`}
                  title={v.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                />
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${TAG_COLORS[v.tag] ?? 'bg-gray-100 text-gray-600'}`}>
                    {v.tag}
                  </span>
                  <span className="text-xs text-gray-500 font-medium">{v.channel}</span>
                </div>
                <h3 className="font-semibold text-gray-900 text-sm leading-snug">{v.title}</h3>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
