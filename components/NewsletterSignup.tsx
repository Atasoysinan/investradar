'use client';

import { useEffect, useRef, useState } from 'react';

class SubscriptionRequestTimeout extends Error {}

export default function NewsletterSignup() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel: () => void = () => {};
    setStatus('loading');
    setErrorMsg('');

    try {
      // Allow the server's Redis admission and ten-second provider budget to finish.
      const { res, data } = await Promise.race([
        new Promise<never>((_, reject) => {
          cancel = () => reject(new Error('Subscription cancelled'));
          controller.signal.addEventListener('abort', cancel, { once: true });
          timer = setTimeout(() => {
            reject(new SubscriptionRequestTimeout());
            controller.abort();
          }, 20000);
        }),
        (async () => {
          const res = await fetch('/api/subscribe', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }), signal: controller.signal,
          });
          if (controller.signal.aborted) throw new Error('Subscription cancelled');
          return { res, data: await res.json() };
        })(),
      ]);
      if (pending.current !== controller) return;

      if (!res.ok) {
        setErrorMsg(typeof data?.error === 'string' ? data.error : 'Something went wrong, try again.');
        setStatus('error');
      } else if (data?.success === true) {
        setStatus('success');
        setEmail('');
      } else {
        throw new Error('Invalid subscription response');
      }
    } catch (error) {
      if (pending.current !== controller) return;
      setErrorMsg(error instanceof SubscriptionRequestTimeout
        ? 'This request took too long. Check your inbox before trying again.'
        : 'Something went wrong, try again.');
      setStatus('error');
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', cancel);
      if (pending.current === controller) pending.current = null;
    }
  };

  return (
    <div className="bg-white rounded-xl border border-[#d9d7d2] p-8 max-w-2xl mx-auto text-center">
      <h2 className="text-2xl font-semibold text-gray-900 mb-2">Stay Ahead of the Market</h2>
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
        <p role="alert" className="text-red-500 text-xs mt-3">❌ {errorMsg}</p>
      )}
    </div>
  );
}
