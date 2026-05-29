'use client';
import { useEffect, useState } from 'react';

interface BreakingArticle {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  isBreaking: boolean;
}

export default function BreakingNewsBanner() {
  const [articles, setArticles] = useState<BreakingArticle[]>([]);
  const [dismissed, setDismissed] = useState(false);

  async function fetchBreaking() {
    try {
      const res = await fetch('/api/breaking-news');
      const data = await res.json();
      if (data.articles?.length > 0) setArticles(data.articles);
    } catch { /* silently fail */ }
  }

  useEffect(() => {
    fetchBreaking();
    const interval = setInterval(fetchBreaking, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (dismissed || articles.length === 0) return null;

  return (
    <div className="w-full bg-black text-white h-10 flex items-center overflow-hidden relative z-50 border-b border-red-700">
      {/* BREAKING badge */}
      <div className="flex-shrink-0 flex items-center px-3 border-r border-red-700 h-full bg-red-700">
        <span className="text-white text-xs font-bold uppercase tracking-widest whitespace-nowrap">
          🔴 Breaking
        </span>
      </div>

      {/* Scrolling ticker */}
      <div className="flex-1 overflow-hidden h-full flex items-center">
        <div className="animate-marquee whitespace-nowrap text-sm text-gray-100">
          {articles.map((a, i) => (
            <span key={i}>
              {i > 0 && <span className="mx-4 text-red-500">·</span>}
              {a.isBreaking && (
                <span className="bg-red-600 text-white text-xs font-bold px-1.5 py-0.5 rounded mr-2 uppercase">NEW</span>
              )}
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-yellow-300 transition-colors cursor-pointer"
              >
                {a.title}
              </a>
              <span className="ml-2 text-gray-500 text-xs uppercase">{a.source}</span>
            </span>
          ))}
          {/* Repeat for seamless loop */}
          {articles.map((a, i) => (
            <span key={`r${i}`}>
              <span className="mx-4 text-red-500">·</span>
              {a.isBreaking && (
                <span className="bg-red-600 text-white text-xs font-bold px-1.5 py-0.5 rounded mr-2 uppercase">NEW</span>
              )}
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-yellow-300 transition-colors cursor-pointer"
              >
                {a.title}
              </a>
              <span className="ml-2 text-gray-500 text-xs uppercase">{a.source}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Dismiss button */}
      <button
        onClick={() => setDismissed(true)}
        className="flex-shrink-0 px-3 text-gray-400 hover:text-white transition-colors text-lg font-light h-full flex items-center border-l border-gray-800"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
