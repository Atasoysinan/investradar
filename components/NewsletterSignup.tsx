'use client';

import { useState } from 'react';

export default function NewsletterSignup() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');

    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || 'Something went wrong, try again.');
        setStatus('error');
      } else {
        setStatus('success');
        setEmail('');
      }
    } catch {
      setErrorMsg('Something went wrong, try again.');
      setStatus('error');
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-md p-8 max-w-2xl mx-auto text-center">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Stay Ahead of the Market 📈</h2>
      <p className="text-gray-500 text-sm mb-6">
        Get weekly market insights &amp; top news delivered to your inbox. Free, no spam.
      </p>

      {status === 'success' ? (
        <p className="text-green-600 font-medium text-sm">✅ You&apos;re in! Check your inbox.</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 justify-center">
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={status === 'loading'}
            className="bg-gray-900 hover:bg-gray-700 disabled:opacity-60 text-white text-sm font-semibold px-6 py-2 rounded-lg transition-colors whitespace-nowrap"
          >
            {status === 'loading' ? 'Subscribing...' : 'Subscribe'}
          </button>
        </form>
      )}

      {status === 'error' && (
        <p className="text-red-500 text-xs mt-3">❌ {errorMsg}</p>
      )}
    </div>
  );
}
