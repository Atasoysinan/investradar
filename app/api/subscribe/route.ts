import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { Resend } from 'resend';
import { getSubscriptionRateLimit } from '@/lib/subscriptionRateLimit';

const WELCOME_FROM = 'InvestRadar <newsletter@investradar.live>';
const AUDIENCE_ID = '2d6a1c17-e733-446e-a3d8-8cae269432b6';
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const MAX_ENTRIES = 5000;
const PROVIDER_TIMEOUT_MS = 10_000;

class SubscriptionTimeout extends Error {}

// Local caches supplement the shared Redis limits and preserve partial progress.
const clients = new Map<string, { count: number; resetAt: number }>();
const subscriptions = new Map<string, {
  expiresAt: number;
  lastAttempt: number;
  count: number;
  resetAt: number;
  processing: boolean;
  attempt?: { token: symbol; deadline: number; controller: AbortController };
  contactSaved: boolean;
  complete: boolean;
}>();
let globalWindow = { count: 0, resetAt: 0 };

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function limited(message: string, retryAfter: number, status = 429) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { 'Retry-After': String(Math.max(1, Math.ceil(retryAfter / 1000))), 'Cache-Control': 'no-store' },
  });
}

export async function POST(req: NextRequest) {
  // Only Vercel's server-provided production environment may mutate contacts or send mail.
  if (process.env.VERCEL_ENV !== 'production') {
    return NextResponse.json(
      { error: 'Subscriptions are disabled in this test environment. No email was sent and no subscription was saved.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  let now = Date.now();
  for (const [key, value] of clients) if (value.resetAt <= now) clients.delete(key);
  for (const [key, value] of subscriptions) {
    if (value.attempt && value.attempt.deadline <= now) {
      value.attempt.controller.abort();
      value.attempt = undefined;
      value.processing = false;
    }
    if (!value.processing && value.expiresAt <= now) subscriptions.delete(key);
  }
  // Only trust the client IP header when Vercel is the serving platform.
  const forwarded = process.env.VERCEL === '1' ? req.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim() : undefined;
  const clientKey = hash(forwarded && isIP(forwarded) ? forwarded : 'unknown-client');
  let sharedLimit: ReturnType<typeof getSubscriptionRateLimit>;
  try {
    sharedLimit = getSubscriptionRateLimit();
    const retryAfter = await sharedLimit.client(clientKey);
    if (retryAfter > 0) return limited('Too many subscription requests. Please try again later.', retryAfter);
  } catch {
    return limited('Subscription service is temporarily unavailable. Please try again later.', MINUTE, 503);
  }
  let client = clients.get(clientKey);
  if (!client) {
    if (clients.size >= MAX_ENTRIES) return limited('Subscription service is busy. Please try again later.', MINUTE, 503);
    client = { count: 0, resetAt: now + 10 * MINUTE };
    clients.set(clientKey, client);
  }
  if (client.count >= 5) return limited('Too many subscription requests. Please try again later.', client.resetAt - now);
  client.count++;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const rawEmail = body && typeof body === 'object' && 'email' in body ? body.email : undefined;
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Subscription service unavailable.' }, { status: 503 });
  }

  now = Date.now();
  const key = hash(email);
  let entry = subscriptions.get(key);
  if (entry?.complete) return NextResponse.json({ success: true });
  if (entry?.processing) return limited('Subscription is already being processed. Please try again shortly.', 5000, 409);
  if (entry && now - entry.lastAttempt < MINUTE) return limited('Please wait before trying this email again.', MINUTE - (now - entry.lastAttempt));
  if (entry && entry.resetAt <= now) { entry.count = 0; entry.resetAt = now + 60 * MINUTE; }
  if (entry && entry.count >= 3) return limited('Too many attempts for this email. Please try again later.', entry.resetAt - now);
  if (globalWindow.resetAt <= now) globalWindow = { count: 0, resetAt: now + MINUTE };
  if (globalWindow.count >= 20) return limited('Subscription service is busy. Please try again shortly.', globalWindow.resetAt - now);
  if (!entry && subscriptions.size >= MAX_ENTRIES) return limited('Subscription service is busy. Please try again later.', MINUTE, 503);
  try {
    const result = await sharedLimit.attempt(key);
    if (result.reason) {
      const message = result.reason === 1 ? 'Please wait before trying this email again.'
        : result.reason === 2 ? 'Too many attempts for this email. Please try again later.'
          : 'Subscription service is busy. Please try again shortly.';
      return limited(message, result.retryAfter);
    }
  } catch {
    return limited('Subscription service is temporarily unavailable. Please try again later.', MINUTE, 503);
  }
  // Redis admission is asynchronous: another request may have started locally.
  // The shared cooldown ensures only one request can obtain admission per email.
  now = Date.now();
  if (!entry) {
    if (subscriptions.size >= MAX_ENTRIES) return limited('Subscription service is busy. Please try again later.', MINUTE, 503);
    entry = { expiresAt: now + DAY, lastAttempt: now, count: 0, resetAt: now + 60 * MINUTE, processing: false, contactSaved: false, complete: false };
    subscriptions.set(key, entry);
  }
  globalWindow.count++;
  entry.count++;
  entry.lastAttempt = now;
  entry.processing = true;
  const attempt = { token: Symbol(), deadline: now + PROVIDER_TIMEOUT_MS, controller: new AbortController() };
  entry.attempt = attempt;
  const currentEntry = entry;
  function assertCurrent() {
    if (currentEntry.attempt?.token !== attempt.token || Date.now() >= attempt.deadline) throw new SubscriptionTimeout();
  }
  async function withinDeadline<T>(operation: () => Promise<T>): Promise<T> {
    assertCurrent();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new SubscriptionTimeout());
            attempt.controller.abort();
          }, Math.max(0, attempt.deadline - Date.now()));
        }),
        operation(),
      ]);
      assertCurrent();
      return result;
    } finally {
      clearTimeout(timer);
    }
  }
  try {
    const resend = new Resend(apiKey);
    // The installed SDK forwards these request options to fetch.
    const contactOptions = { headers: {}, signal: attempt.controller.signal };
    if (!entry.contactSaved) {
      const contact = await withinDeadline(() => resend.contacts.create({ email, audienceId: AUDIENCE_ID, unsubscribed: false }, contactOptions));
      if (contact.error || !contact.data) {
        return NextResponse.json({ error: 'Failed to subscribe.' }, { status: 502 });
      }
      entry.contactSaved = true;
    }
    const emailOptions = { idempotencyKey: `newsletter-welcome/v2/${key}`, signal: attempt.controller.signal };
    const welcome = await withinDeadline(() => resend.emails.send({
      from: WELCOME_FROM,
      to: email,
      subject: 'Welcome to InvestRadar 🚀',
      html: '<h2>Welcome!</h2><p>Thanks for subscribing to <strong>InvestRadar</strong>! You will receive weekly market insights and top news digests.</p><p>— The InvestRadar Team</p>'
    }, emailOptions));
    if (welcome.error || !welcome.data) {
      return NextResponse.json({ error: 'Subscription saved, but the welcome email could not be sent.' }, { status: 502 });
    }
    entry.complete = true;
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof SubscriptionTimeout) {
      return limited('Subscription request timed out. Please try again shortly.', Math.max(0, MINUTE - (Date.now() - now)), 504);
    }
    return NextResponse.json({ error: 'Failed to subscribe.' }, { status: 500 });
  } finally {
    if (entry.attempt?.token === attempt.token) {
      entry.processing = false;
      entry.attempt = undefined;
    }
  }
}
