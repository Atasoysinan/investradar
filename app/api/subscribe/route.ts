import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import fs from 'fs';
import path from 'path';

const resend = new Resend(process.env.RESEND_API_KEY);

const SUBSCRIBERS_FILE = path.join(process.cwd(), 'data', 'subscribers.json');

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function appendSubscriber(email: string) {
  let subscribers: { email: string; subscribedAt: string }[] = [];
  try {
    const raw = fs.readFileSync(SUBSCRIBERS_FILE, 'utf-8');
    subscribers = JSON.parse(raw);
  } catch {
    // file missing or malformed — start fresh
  }

  if (subscribers.some(s => s.email === email)) return false; // already subscribed

  subscribers.push({ email, subscribedAt: new Date().toISOString() });
  fs.mkdirSync(path.dirname(SUBSCRIBERS_FILE), { recursive: true });
  fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(subscribers, null, 2));
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
    }

    const isNew = appendSubscriber(email);

    if (!isNew) {
      return NextResponse.json({ error: 'This email is already subscribed.' }, { status: 409 });
    }

    await resend.emails.send({
      from: 'InvestRadar <onboarding@resend.dev>',
      to: email,
      subject: 'Welcome to InvestRadar 🚀',
      html: '<h2>Welcome!</h2><p>Thanks for subscribing to <strong>InvestRadar</strong>! You\'ll receive weekly market insights and top news digests straight to your inbox.</p><p>— The InvestRadar Team</p>',
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to process subscription.' }, { status: 500 });
  }
}
